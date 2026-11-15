// Analisador semântico: resolve nomes, verifica tipos e anota a AST para o interpretador.
import { PascalError } from './errors.js';
import {
  T_INT, T_REAL, T_BOOL, T_CHAR, T_STR, T_VOID, T_ANY, BASE_TYPES,
  isNum, isInt, isOrdinal, isStrLike, isBool, typeName, sameType, assignable, ordOf,
} from './types.js';
import { binop, unop } from './ops.js';

// ---------------------------------------------------------------- Builtins
// Procedimentos e funções predefinidos.
export const BUILTIN_PROCS = new Set([
  'write', 'writeln', 'read', 'readln', 'clrscr', 'randomize', 'halt', 'delay',
  'gotoxy', 'textcolor', 'textbackground', 'inc', 'dec', 'setlength', 'str', 'val',
  'insert', 'delete', 'cursoroff', 'cursoron', 'clreol', 'normvideo', 'highvideo',
  'lowvideo', 'sound', 'nosound', 'include', 'exclude',
]);
export const BUILTIN_FUNCS = new Set([
  'abs', 'sqr', 'sqrt', 'sin', 'cos', 'tan', 'arctan', 'ln', 'exp', 'round', 'trunc',
  'int', 'frac', 'pi', 'random', 'odd', 'ord', 'chr', 'succ', 'pred', 'length',
  'copy', 'pos', 'concat', 'upcase', 'lowercase', 'uppercase', 'inttostr',
  'floattostr', 'strtoint', 'strtofloat', 'strtointdef', 'trim', 'trimleft',
  'trimright', 'power', 'max', 'min', 'high', 'low', 'readkey', 'keypressed',
  'ceil', 'floor', 'booltostr', 'stringofchar', 'formatfloat', 'log10', 'log2',
  'wherex', 'wherey', 'sign', 'reversestring', 'ansiuppercase', 'ansilowercase',
  'leftstr', 'rightstr', 'isnan', 'trunc', 'hi', 'lo',
]);

const CONSTANTS = {
  true: { type: T_BOOL, value: true },
  false: { type: T_BOOL, value: false },
  maxint: { type: T_INT, value: 32767 },
  maxlongint: { type: T_INT, value: 2147483647 },
  // Cores da unit CRT
  black: { type: T_INT, value: 0 }, blue: { type: T_INT, value: 1 },
  green: { type: T_INT, value: 2 }, cyan: { type: T_INT, value: 3 },
  red: { type: T_INT, value: 4 }, magenta: { type: T_INT, value: 5 },
  brown: { type: T_INT, value: 6 }, lightgray: { type: T_INT, value: 7 },
  darkgray: { type: T_INT, value: 8 }, lightblue: { type: T_INT, value: 9 },
  lightgreen: { type: T_INT, value: 10 }, lightcyan: { type: T_INT, value: 11 },
  lightred: { type: T_INT, value: 12 }, lightmagenta: { type: T_INT, value: 13 },
  yellow: { type: T_INT, value: 14 }, white: { type: T_INT, value: 15 },
  blink: { type: T_INT, value: 128 },
};

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[m][n];
}

class Scope {
  constructor(parent, owner) {
    this.parent = parent;
    this.owner = owner || (parent ? parent.owner : null);
    this.syms = new Map();
  }
  lookup(name) {
    for (let s = this; s; s = s.parent) {
      const v = s.syms.get(name);
      if (v) return v;
    }
    return null;
  }
  allNames() {
    const out = [];
    for (let s = this; s; s = s.parent) for (const k of s.syms.keys()) out.push(k);
    return out;
  }
}

export class Analyzer {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.global = new Scope(null, null);
    for (const [n, t] of Object.entries(BASE_TYPES)) this.global.syms.set(n, { kind: 'type', type: t, name: n });
    for (const [n, c] of Object.entries(CONSTANTS)) this.global.syms.set(n, { kind: 'const', type: c.type, value: c.value, name: n, builtin: true });
    for (const n of BUILTIN_PROCS) this.global.syms.set(n, { kind: 'builtin', name: n, proc: true });
    for (const n of BUILTIN_FUNCS) this.global.syms.set(n, { kind: 'builtin', name: n, func: true });
    this.loopDepth = 0;
    this.forVars = new Set();
    this.realWriteHint = false;
  }

  err(node, msg, hint) {
    if (this.errors.length > 30) return;
    const line = node ? node.opLine || node.line : 0;
    const col = node ? node.opCol || node.col : 0;
    // evita erros duplicados na mesma linha
    if (this.errors.some((e) => e.line === line && e.message === msg)) return;
    this.errors.push(new PascalError(msg, line, col, hint));
  }
  warn(node, msg, hint) {
    this.warnings.push({ message: msg, line: node ? node.line : 0, hint: hint || '' });
  }

  suggest(name, scope) {
    let best = null;
    let bestD = 3;
    for (const n of scope.allNames()) {
      const d = levenshtein(name, n);
      if (d < bestD && d <= Math.max(1, Math.floor(name.length / 3))) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  undeclared(node, name, scope, rawName) {
    const sug = this.suggest(name, scope);
    let hint = `Declare '${rawName || name}' na seção var. Ex: ${rawName || name}: integer;`;
    if (sug) hint = `Você quis dizer '${this.displayName(scope.lookup(sug), sug)}'? ` + hint;
    this.err(node, `Identificador não declarado: '${rawName || name}'`, hint);
  }

  displayName(sym, fallback) {
    return (sym && (sym.raw || sym.nameRaw)) || fallback;
  }

  // ---------------------------------------------------------------- Programa
  analyze(ast) {
    ast.scope = this.global;
    const progScope = new Scope(this.global, null);
    this.declareBlock(ast.block, progScope);
    this.checkStmt(ast.block.body, progScope);
    this.reportUnused(progScope, true);
    return { errors: this.errors, warnings: this.warnings };
  }

  reportUnused(scope) {
    for (const sym of scope.syms.values()) {
      if (sym.kind === 'var' && !sym.isParam && !sym.isResult && !sym.used && !sym.assigned) {
        this.warn(sym.node, `A variável '${sym.raw}' foi declarada mas nunca é usada`);
      } else if (sym.kind === 'var' && !sym.isParam && !sym.isResult && sym.assigned && !sym.used && !sym.readByIO) {
        // recebe valores mas nunca é lida
        this.warn(sym.node, `A variável '${sym.raw}' recebe valor mas nunca é usada`);
      }
    }
  }

  declareBlock(block, scope) {
    block.vars = []; // [{name, type, init}]
    block.routines = [];
    for (const d of block.decls) {
      switch (d.kind) {
        case 'const': {
          if (scope.syms.has(d.name)) this.err(d, `'${d.nameRaw}' já foi declarado`);
          if (d.typeNode) {
            // constante tipada = variável inicializada
            const t = this.resolveType(d.typeNode, scope);
            const sym = { kind: 'var', type: t, name: d.name, raw: d.nameRaw, store: d.name, node: d, used: true, assigned: true };
            scope.syms.set(d.name, sym);
            block.vars.push({ name: d.name, type: t, init: this.constInit(d.value, t, scope) });
          } else {
            const c = this.evalConst(d.value, scope);
            scope.syms.set(d.name, { kind: 'const', type: c.type, value: c.value, name: d.name, raw: d.nameRaw, node: d });
          }
          break;
        }
        case 'typedecl': {
          if (scope.syms.has(d.name)) this.err(d, `'${d.nameRaw}' já foi declarado`);
          const t = this.resolveType(d.typeNode, scope);
          let named = t;
          if (t.k === 'array' || t.k === 'record' || t.k === 'enum' || t.k === 'dynarray') {
            if (!t.name) t.name = d.nameRaw;
            named = t;
          }
          scope.syms.set(d.name, { kind: 'type', type: named, name: d.name, raw: d.nameRaw });
          break;
        }
        case 'var': {
          const t = this.resolveType(d.typeNode, scope);
          d.names.forEach((name, i) => {
            if (scope.syms.has(name) && !(scope.syms.get(name).isResult)) {
              this.err(d, `A variável '${d.raws[i]}' já foi declarada`, 'Cada nome só pode ser declarado uma vez no mesmo escopo.');
            }
            if (scope.owner && scope.owner.name === name) {
              this.err(d, `'${d.raws[i]}' tem o mesmo nome da rotina`);
            }
            const sym = { kind: 'var', type: t, name, raw: d.raws[i], store: name, node: d };
            scope.syms.set(name, sym);
            let init = null;
            if (d.init) {
              if (d.names.length > 1) this.err(d, 'Só é possível inicializar uma variável por vez');
              init = this.constInit(d.init, t, scope);
            }
            block.vars.push({ name, type: t, init });
          });
          break;
        }
        case 'routine':
          this.declareRoutine(d, scope, block);
          break;
        default:
          break;
      }
    }
  }

  constInit(expr, t, scope) {
    if (expr.kind === 'arraylit') {
      if (t.k !== 'array') {
        this.err(expr, 'Lista de valores só pode inicializar um array');
        return null;
      }
      const n = t.hi - t.lo + 1;
      if (expr.items.length !== n) this.err(expr, `O array tem ${n} posições, mas foram fornecidos ${expr.items.length} valores`);
      return { lo: t.lo, data: expr.items.map((it) => this.constInit(it, t.elem, scope)) };
    }
    const c = this.evalConst(expr, scope);
    if (!assignable(t, c.type)) this.err(expr, `Valor inicial do tipo ${typeName(c.type)} incompatível com ${typeName(t)}`);
    return c.value;
  }

  declareRoutine(d, scope, block) {
    const existing = scope.syms.get(d.name);
    let sym;
    if (existing && existing.kind === 'routine' && existing.forward && d.block) {
      sym = existing;
      sym.node = d;
      sym.forward = false;
    } else {
      if (existing && scope === this.global) {
        // permite redefinir builtins? não.
      }
      if (existing && scope.syms.has(d.name)) this.err(d, `'${d.nameRaw}' já foi declarado`);
      sym = { kind: 'routine', name: d.name, raw: d.nameRaw, isFunc: d.isFunc, node: d, params: [], ret: T_VOID, forward: !!d.forward, parentOwner: scope.owner };
      // parâmetros
      for (const p of d.params) {
        const pt = this.resolveType(p.typeNode, scope);
        for (const n of p.names) sym.params.push({ name: n, type: pt, mode: p.mode, def: p.def });
      }
      if (d.isFunc) sym.ret = this.resolveType(d.retType, scope);
      scope.syms.set(d.name, sym);
    }
    d.sym = sym;
    if (!d.block) return;
    block.routines.push(d);

    const inner = new Scope(scope, sym);
    for (const p of sym.params) {
      if (inner.syms.has(p.name)) this.err(d, `Parâmetro '${p.name}' repetido`);
      inner.syms.set(p.name, { kind: 'var', type: p.type, name: p.name, raw: p.name, store: p.name, mode: p.mode, isParam: true, node: d });
    }
    if (d.isFunc) {
      const resSym = { kind: 'var', type: sym.ret, name: 'result', raw: 'Result', store: '#res:' + d.name, isResult: true, fn: sym, node: d };
      if (!inner.syms.has('result')) inner.syms.set('result', resSym);
      sym.resultSym = resSym;
    }
    const savedLoop = this.loopDepth;
    const savedFor = this.forVars;
    this.loopDepth = 0;
    this.forVars = new Set();
    this.declareBlock(d.block, inner);
    this.checkStmt(d.block.body, inner);
    this.loopDepth = savedLoop;
    this.forVars = savedFor;
    if (d.isFunc && !sym.resultSym.assigned) {
      this.warn(d, `A função '${d.nameRaw}' nunca define o valor de retorno`,
        `Atribua o resultado com ${d.nameRaw} := valor; (ou Result := valor;)`);
    }
    this.reportUnused(inner);
  }

  // ---------------------------------------------------------------- Tipos
  resolveType(tn, scope) {
    switch (tn.kind) {
      case 'tname': {
        const sym = scope.lookup(tn.name);
        if (!sym) {
          const sug = this.suggest(tn.name, scope);
          this.err(tn, `Tipo desconhecido: '${tn.raw || tn.name}'`,
            sug ? `Você quis dizer '${sug}'?` : 'Tipos comuns: integer, real, string, char, boolean.');
          return T_ANY;
        }
        if (sym.kind !== 'type') {
          this.err(tn, `'${tn.raw || tn.name}' não é um tipo`);
          return T_ANY;
        }
        return sym.type;
      }
      case 'tarray': {
        const elem = this.resolveType(tn.elem, scope);
        if (tn.dynamic) return { k: 'dynarray', elem };
        let t = elem;
        for (let i = tn.ranges.length - 1; i >= 0; i--) {
          const r = tn.ranges[i];
          let lo, hi, idx, loLabel, hiLabel;
          if (r.typeName) {
            const rt = this.typeFromExprName(r.typeName, scope);
            idx = rt;
            if (rt.k === 'bool') { lo = 0; hi = 1; loLabel = 'false'; hiLabel = 'true'; }
            else if (rt.k === 'char') { lo = 0; hi = 255; loLabel = '#0'; hiLabel = '#255'; }
            else if (rt.k === 'enum') { lo = 0; hi = rt.names.length - 1; loLabel = rt.names[0]; hiLabel = rt.names[hi]; }
            else { this.err(r.typeName, 'Faixa de índices inválida'); lo = 0; hi = 0; }
          } else {
            const a = this.evalConst(r.lo, scope);
            const b = this.evalConst(r.hi, scope);
            if (!isOrdinal(a.type) || !isOrdinal(b.type)) {
              this.err(r.lo, 'Os limites do array devem ser inteiros ou caracteres', 'Ex: array[1..10] of integer');
            }
            idx = a.type;
            lo = ordOf(a.value);
            hi = ordOf(b.value);
            loLabel = a.type.k === 'char' ? `'${a.value}'` : String(a.value);
            hiLabel = b.type.k === 'char' ? `'${b.value}'` : String(b.value);
            if (hi < lo) this.err(r.lo, `Faixa do array inválida: ${loLabel}..${hiLabel}`, 'O limite inferior deve ser menor ou igual ao superior.');
            if (hi - lo > 5_000_000) this.err(r.lo, 'Array grande demais');
          }
          t = { k: 'array', lo, hi, idx, elem: t, loLabel, hiLabel };
        }
        return t;
      }
      case 'trecord': {
        const fields = new Map();
        for (const f of tn.fields) {
          const ft = this.resolveType(f.typeNode, scope);
          for (const n of f.names) {
            if (fields.has(n)) this.err(tn, `Campo '${n}' repetido`);
            fields.set(n, ft);
          }
        }
        return { k: 'record', fields };
      }
      case 'tenum': {
        const t = { k: 'enum', names: tn.names };
        tn.names.forEach((n, i) => {
          if (scope.syms.has(n)) this.err(tn, `'${n}' já foi declarado`);
          scope.syms.set(n, { kind: 'const', type: t, value: i, name: n });
        });
        return t;
      }
      case 'tsubrange': {
        const a = this.evalConst(tn.lo, scope);
        this.evalConst(tn.hi, scope);
        return a.type;
      }
      case 'tset': {
        const elem = this.resolveType(tn.elem, scope);
        return { k: 'set', elem };
      }
      default:
        this.err(tn, 'Tipo inválido');
        return T_ANY;
    }
  }

  typeFromExprName(e, scope) {
    if (e.kind === 'id') {
      const s = scope.lookup(e.name);
      if (s && s.kind === 'type') return s.type;
    }
    this.err(e, 'Esperado um tipo ordinal ou uma faixa (ex: 1..10)');
    return T_ANY;
  }

  // ---------------------------------------------------------------- Constantes
  evalConst(e, scope) {
    const fail = (msg) => {
      this.err(e, msg || 'Esperado um valor constante', 'Constantes e limites de arrays precisam ser valores fixos (números, textos ou outras constantes).');
      return { type: T_ANY, value: 0 };
    };
    switch (e.kind) {
      case 'num':
        return { type: e.isReal ? T_REAL : T_INT, value: e.value };
      case 'str':
        return { type: e.value.length === 1 ? T_CHAR : T_STR, value: e.value };
      case 'id': {
        const s = scope.lookup(e.name);
        if (!s) {
          this.undeclared(e, e.name, scope, e.raw);
          return { type: T_ANY, value: 0 };
        }
        if (s.kind === 'const') return { type: s.type, value: s.value };
        if (s.kind === 'builtin' && e.name === 'pi') return { type: T_REAL, value: Math.PI };
        return fail(`'${e.raw}' não é uma constante`);
      }
      case 'un': {
        const v = this.evalConst(e.expr, scope);
        return { type: v.type, value: unop(e.op, v.value) };
      }
      case 'bin': {
        const a = this.evalConst(e.left, scope);
        const b = this.evalConst(e.right, scope);
        const t = this.binType(e, a.type, b.type);
        try {
          let v = binop(e.rop || e.op, a.value, b.value, a.type, b.type, e.line);
          if (t.k === 'char' && typeof v === 'string' && v.length !== 1) return { type: T_STR, value: v };
          return { type: t, value: v };
        } catch (ex) {
          return fail(ex.message);
        }
      }
      case 'call': {
        const args = e.args.map((a) => this.evalConst(a, scope));
        const a0 = args[0] ? args[0].value : 0;
        switch (e.name) {
          case 'chr': return { type: T_CHAR, value: String.fromCharCode(a0) };
          case 'ord': return { type: T_INT, value: ordOf(a0) };
          case 'length': return { type: T_INT, value: String(a0).length };
          case 'sqr': return { type: args[0].type, value: a0 * a0 };
          case 'abs': return { type: args[0].type, value: Math.abs(a0) };
          case 'sqrt': return { type: T_REAL, value: Math.sqrt(a0) };
          case 'round': return { type: T_INT, value: Math.round(a0) };
          case 'trunc': return { type: T_INT, value: Math.trunc(a0) };
          default: return fail();
        }
      }
      case 'set': {
        const s = new Set();
        let et = T_ANY;
        for (const el of e.elems) {
          const lo = this.evalConst(el.lo, scope);
          et = lo.type;
          if (el.hi) {
            const hi = this.evalConst(el.hi, scope);
            for (let i = ordOf(lo.value); i <= ordOf(hi.value); i++) s.add(i);
          } else s.add(ordOf(lo.value));
        }
        return { type: { k: 'set', elem: et }, value: s };
      }
      default:
        return fail();
    }
  }

  // ---------------------------------------------------------------- Expressões
  binType(e, lt, rt) {
    const op = e.op;
    const any = lt.k === 'any' || rt.k === 'any';
    const opName = `'${op}'`;
    const both = `${typeName(lt)} ${op} ${typeName(rt)}`;
    switch (op) {
      case '+':
        if (lt.k === 'set' && rt.k === 'set') { e.rop = '+set'; return lt; }
        if (isStrLike(lt) && isStrLike(rt) && (lt.k !== 'any' || rt.k !== 'any')) return T_STR;
        if (isNum(lt) && isNum(rt)) return lt.k === 'real' || rt.k === 'real' ? T_REAL : (any ? T_ANY : T_INT);
        if ((isStrLike(lt) && isNum(rt)) || (isNum(lt) && isStrLike(rt))) {
          this.err(e, `Não é possível somar texto com número (${both})`,
            "Para juntar texto e número use IntToStr(n) / FloatToStr(x), ou no writeln separe com vírgula: writeln('Total: ', n);");
          return T_STR;
        }
        this.err(e, `Operador ${opName} não se aplica a ${both}`);
        return T_ANY;
      case '-':
      case '*':
        if (lt.k === 'set' && rt.k === 'set') return lt;
        if (isNum(lt) && isNum(rt)) return lt.k === 'real' || rt.k === 'real' ? T_REAL : (any ? T_ANY : T_INT);
        this.err(e, `Operador ${opName} só funciona com números (recebeu ${both})`);
        return T_ANY;
      case '/':
        if (isNum(lt) && isNum(rt)) return T_REAL;
        this.err(e, `Operador '/' só funciona com números (recebeu ${both})`);
        return T_REAL;
      case 'div':
      case 'mod':
        if (isInt(lt) && isInt(rt)) return T_INT;
        this.err(e, `'${op}' só funciona com inteiros (recebeu ${both})`,
          op === 'div' ? "Para dividir números reais use '/'. Para converter real em inteiro use trunc() ou round()." : 'Use trunc() ou round() para converter reais em inteiros.');
        return T_INT;
      case 'and':
      case 'or':
      case 'xor':
        if (isBool(lt) && isBool(rt)) return T_BOOL;
        if (isInt(lt) && isInt(rt)) return T_INT;
        this.err(e, `'${op}' precisa de dois valores boolean (recebeu ${both})`,
          `Em Pascal, '${op}' tem prioridade maior que as comparações. Use parênteses: (a > 0) ${op} (b > 0)`);
        return T_BOOL;
      case 'shl':
      case 'shr':
        if (isInt(lt) && isInt(rt)) return T_INT;
        this.err(e, `'${op}' só funciona com inteiros`);
        return T_INT;
      case '=':
      case '<>':
      case '<':
      case '>':
      case '<=':
      case '>=': {
        const ok =
          (isNum(lt) && isNum(rt)) ||
          (isStrLike(lt) && isStrLike(rt)) ||
          (lt.k === 'bool' && rt.k === 'bool') ||
          (lt.k === 'enum' && sameType(lt, rt)) ||
          (lt.k === 'set' && rt.k === 'set') ||
          any;
        if (!ok) {
          let hint;
          if ((isStrLike(lt) && isNum(rt)) || (isNum(lt) && isStrLike(rt))) {
            hint = "Texto e número não podem ser comparados. Se for um caractere, use apóstrofos: x = '1'.";
          }
          this.err(e, `Não é possível comparar ${typeName(lt)} com ${typeName(rt)}`, hint);
        }
        return T_BOOL;
      }
      case 'in':
        if (rt.k !== 'set' && !any) this.err(e, "O lado direito de 'in' deve ser um conjunto, ex: x in [1, 2, 3]");
        if (!isOrdinal(lt)) this.err(e, "O lado esquerdo de 'in' deve ser inteiro, char ou enumerado");
        return T_BOOL;
      default:
        return T_ANY;
    }
  }

  /** Verifica uma expressão e retorna seu tipo; anota e.ty */
  expr(e, scope) {
    const t = this.expr0(e, scope);
    e.ty = t;
    return t;
  }

  expr0(e, scope) {
    switch (e.kind) {
      case 'num':
        return e.isReal ? T_REAL : T_INT;
      case 'str':
        return e.value.length === 1 ? T_CHAR : T_STR;
      case 'id':
        return this.identExpr(e, scope);
      case 'un': {
        const t = this.expr(e.expr, scope);
        e.async = e.expr.async;
        if (e.op === 'not') {
          if (isBool(t) || isInt(t)) return t;
          this.err(e, `'not' precisa de um valor boolean (recebeu ${typeName(t)})`);
          return T_BOOL;
        }
        if (!isNum(t)) this.err(e, `Sinal '${e.op}' só se aplica a números`);
        return t;
      }
      case 'bin': {
        const lt = this.expr(e.left, scope);
        const rt = this.expr(e.right, scope);
        e.async = e.left.async || e.right.async;
        // Avaliação em curto-circuito é usada apenas para boolean
        return this.binType(e, lt, rt);
      }
      case 'index':
      case 'field':
        return this.designator(e, scope, false);
      case 'call':
        return this.callExpr(e, scope, false);
      case 'set': {
        let et = T_ANY;
        for (const el of e.elems) {
          const t1 = this.expr(el.lo, scope);
          if (!isOrdinal(t1)) this.err(el.lo, 'Elementos de conjuntos devem ser inteiros, chars ou enumerados');
          if (el.hi) this.expr(el.hi, scope);
          if (el.lo.async || (el.hi && el.hi.async)) e.async = true;
          et = t1;
        }
        return { k: 'set', elem: et };
      }
      case 'arraylit':
        this.err(e, 'Lista de valores só é permitida na inicialização de constantes');
        return T_ANY;
      default:
        this.err(e, 'Expressão inválida');
        return T_ANY;
    }
  }

  identExpr(e, scope) {
    const s = scope.lookup(e.name);
    if (!s) {
      this.undeclared(e, e.name, scope, e.raw);
      return T_ANY;
    }
    switch (s.kind) {
      case 'var':
        e.ref = 'var';
        e.store = s.store;
        e.sym = s;
        s.used = true;
        return s.type;
      case 'const':
        e.ref = 'const';
        e.cv = s.value;
        return s.type;
      case 'routine':
        if (!s.isFunc) {
          this.err(e, `'${s.raw}' é um procedimento e não retorna valor`, 'Procedimentos não podem ser usados dentro de expressões.');
          return T_ANY;
        }
        // chamada sem parênteses
        e.kind = 'call';
        e.args = [];
        e.name = s.name;
        return this.callExpr(e, scope, false);
      case 'builtin':
        e.kind = 'call';
        e.args = [];
        return this.callExpr(e, scope, false);
      case 'type':
        this.err(e, `'${e.raw}' é um tipo, não um valor`);
        return T_ANY;
      default:
        return T_ANY;
    }
  }

  /** Verifica um designador (variável, elemento de array, campo). lvalue=true exige variável. */
  designator(e, scope, lvalue) {
    switch (e.kind) {
      case 'id': {
        const s = scope.lookup(e.name);
        if (!s) {
          this.undeclared(e, e.name, scope, e.raw);
          return T_ANY;
        }
        if (s.kind === 'var') {
          e.ref = 'var';
          e.store = s.store;
          e.sym = s;
          if (!lvalue) s.used = true;
          e.ty = s.type;
          return s.type;
        }
        if (lvalue && s.kind === 'routine' && s.isFunc) {
          // atribuição ao nome da função = valor de retorno
          if (this.isInside(scope, s)) {
            e.ref = 'var';
            e.store = s.resultSym.store;
            e.sym = s.resultSym;
            e.ty = s.ret;
            return s.ret;
          }
          this.err(e, `Só é possível atribuir ao nome da função '${s.raw}' dentro dela mesma`);
          return T_ANY;
        }
        if (lvalue) {
          if (s.kind === 'const') {
            this.err(e, `'${e.raw}' é uma constante e não pode receber valor`, 'Se o valor precisa mudar, declare como variável (var).');
          } else if (s.kind === 'routine' || s.kind === 'builtin') {
            this.err(e, `'${e.raw}' é uma rotina, não uma variável`);
          } else this.err(e, `'${e.raw}' não é uma variável`);
          return T_ANY;
        }
        return this.expr(e, scope);
      }
      case 'index': {
        let t = lvalue ? this.designator(e.target, scope, true) : this.expr(e.target, scope);
        e.async = e.target.async;
        e.dims = [];
        for (const ix of e.indices) {
          const it = this.expr(ix, scope);
          if (ix.async) e.async = true;
          if (t.k === 'array') {
            if (!isOrdinal(it) || (t.idx && t.idx.k !== 'any' && it.k !== 'any' && !sameType(t.idx, it) && !(t.idx.k === 'int' && it.k === 'int'))) {
              this.err(ix, `Índice do tipo ${typeName(it)} inválido para ${typeName(t)}`,
                it.k === 'real' ? 'Índices devem ser inteiros. Use trunc() ou round().' : undefined);
            }
            e.dims.push({ lo: t.lo, hi: t.hi, kind: 'array', loLabel: t.loLabel, hiLabel: t.hiLabel });
            t = t.elem;
          } else if (t.k === 'dynarray') {
            if (!isInt(it)) this.err(ix, 'Índice de array dinâmico deve ser inteiro');
            e.dims.push({ kind: 'dyn' });
            t = t.elem;
          } else if (t.k === 'str') {
            if (!isInt(it)) this.err(ix, 'Índice de string deve ser inteiro');
            e.dims.push({ kind: 'str' });
            t = T_CHAR;
          } else if (t.k === 'any') {
            e.dims.push({ kind: 'any' });
          } else {
            this.err(e, `${typeName(t)} não pode ser indexado com [ ]`, 'Somente arrays e strings podem usar colchetes.');
            return T_ANY;
          }
        }
        e.ty = t;
        return t;
      }
      case 'field': {
        const t = lvalue ? this.designator(e.target, scope, true) : this.expr(e.target, scope);
        e.async = e.target.async;
        if (t.k === 'any') return T_ANY;
        if (t.k !== 'record') {
          this.err(e, `'.${e.raw}': ${typeName(t)} não é um record`);
          return T_ANY;
        }
        const ft = t.fields.get(e.name);
        if (!ft) {
          this.err(e, `O record ${typeName(t)} não tem o campo '${e.raw}'`, `Campos disponíveis: ${[...t.fields.keys()].join(', ')}`);
          return T_ANY;
        }
        e.ty = ft;
        return ft;
      }
      case 'call':
        if (lvalue) {
          const cs = scope.lookup(e.name);
          if (cs && cs.kind === 'var') {
            this.err(e, `'${e.nameRaw}' é uma variável: use colchetes [ ] para acessar posições`, `Ex: ${e.nameRaw}[1] := valor;`);
          } else this.err(e, 'Não é possível atribuir valor a uma chamada de função');
          return T_ANY;
        }
        return this.callExpr(e, scope, false);
      default:
        if (lvalue) {
          this.err(e, 'Esperada uma variável');
          return T_ANY;
        }
        return this.expr(e, scope);
    }
  }

  isInside(scope, routineSym) {
    for (let s = scope; s; s = s.parent) if (s.owner === routineSym) return true;
    return false;
  }

  lvalue(e, scope, forIO = false) {
    const t = this.designator(e, scope, true);
    e.ty = t;
    let root = e;
    while (root.kind === 'index' || root.kind === 'field') root = root.target;
    if (root.kind === 'id' && root.sym) {
      root.sym.assigned = true;
      if (forIO) root.sym.readByIO = true;
      if (this.forVars.has(root.sym)) {
        this.err(e, `A variável de controle '${root.sym.raw}' do for não pode ser alterada dentro do laço`);
      }
      if (root.sym.mode === 'const') this.err(e, `O parâmetro const '${root.sym.raw}' não pode ser alterado`);
    }
    return t;
  }

  checkArgsCount(e, min, max, name) {
    const n = e.args.length;
    if (n < min || n > max) {
      const exp = min === max ? `${min}` : max === Infinity ? `pelo menos ${min}` : `de ${min} a ${max}`;
      this.err(e, `'${name}' espera ${exp} argumento(s), mas recebeu ${n}`);
      return false;
    }
    return true;
  }

  callExpr(e, scope, isStmt) {
    const s = scope.lookup(e.name);
    const raw = e.nameRaw || e.raw || e.name;
    if (!s) {
      this.undeclared(e, e.name, scope, raw);
      for (const a of e.args) this.expr(a, scope);
      return T_ANY;
    }
    if (s.kind === 'routine') return this.userCall(e, s, scope, isStmt);
    if (s.kind === 'builtin') {
      e.builtin = s.name;
      if (s.proc && !isStmt) {
        this.err(e, `'${raw}' é um procedimento e não pode ser usado em uma expressão`);
      }
      const t = this.builtinCall(e, s.name, scope, isStmt);
      for (const a of e.args) {
        if (a.async) e.async = true;
        if ((a.width || a.prec) && s.name !== 'write' && s.name !== 'writeln' && s.name !== 'str') {
          this.err(a, "Formatação ':' só é permitida em write/writeln/str");
        }
      }
      return t;
    }
    if (s.kind === 'type') {
      // conversão de tipo: integer(x), char(x)...
      if (e.args.length !== 1) {
        this.err(e, `Conversão para ${typeName(s.type)} precisa de exatamente 1 argumento`);
        return s.type;
      }
      const at = this.expr(e.args[0], scope);
      e.async = e.args[0].async;
      e.cast = s.type;
      if (!(isOrdinal(s.type) && isOrdinal(at)) && !(s.type.k === 'real' && isNum(at)) && !(s.type.k === 'str' && isStrLike(at))) {
        this.err(e, `Não é possível converter ${typeName(at)} para ${typeName(s.type)}`,
          s.type.k === 'int' && at.k === 'real' ? 'Use trunc() ou round() para converter real em inteiro.' :
            s.type.k === 'int' && at.k === 'str' ? 'Use StrToInt() para converter texto em inteiro.' : undefined);
      }
      return s.type;
    }
    if (s.kind === 'var') {
      this.err(e, `'${raw}' é uma variável, não uma função ou procedimento`,
        s.type.k === 'array' ? 'Para acessar uma posição do array use colchetes: v[i].' : undefined);
      return T_ANY;
    }
    this.err(e, `'${raw}' não pode ser chamado`);
    return T_ANY;
  }

  userCall(e, s, scope, isStmt) {
    e.routine = s;
    e.async = true;
    if (!s.isFunc && !isStmt) {
      this.err(e, `'${s.raw}' é um procedimento e não retorna valor`, 'Procedimentos não podem ser usados em expressões. Use uma função (function) se precisar de um resultado.');
    }
    const params = s.params;
    const required = params.filter((p) => !p.def).length;
    if (e.args.length < required || e.args.length > params.length) {
      this.err(e, `'${s.raw}' espera ${params.length} argumento(s), mas recebeu ${e.args.length}`,
        params.length ? `Parâmetros: ${params.map((p) => `${p.mode === 'var' ? 'var ' : ''}${p.name}: ${typeName(p.type)}`).join('; ')}` : undefined);
    }
    e.args.forEach((a, i) => {
      const p = params[i];
      if (!p) {
        this.expr(a, scope);
        return;
      }
      if (p.mode === 'var') {
        if (!['id', 'index', 'field'].includes(a.kind)) {
          this.expr(a, scope);
          this.err(a, `O parâmetro '${p.name}' é 'var' e precisa receber uma variável, não um valor`);
          return;
        }
        const at = this.lvalue(a, scope);
        if (!sameType(p.type, at) && !(p.type.k === 'str' && at.k === 'str')) {
          this.err(a, `Parâmetro var '${p.name}' é ${typeName(p.type)}, mas recebeu variável ${typeName(at)}`,
            'Em parâmetros var o tipo da variável deve ser exatamente o mesmo.');
        }
        a.byRef = true;
      } else {
        const at = this.expr(a, scope);
        if (!assignable(p.type, at)) {
          this.err(a, `Argumento '${p.name}' de '${s.raw}': esperado ${typeName(p.type)}, recebeu ${typeName(at)}`);
        }
      }
    });
    return s.ret;
  }

  builtinCall(e, name, scope, isStmt) {
    const A = e.args;
    const T = (i) => this.expr(A[i], scope);
    const need = (min, max = min) => this.checkArgsCount(e, min, max, name);
    const numArg = (i) => {
      const t = T(i);
      if (!isNum(t)) this.err(A[i], `'${name}' espera um número, mas recebeu ${typeName(t)}`,
        t.k === 'str' ? 'Para converter texto em número use StrToInt() ou StrToFloat().' : undefined);
      return t;
    };
    const intArg = (i) => {
      const t = T(i);
      if (!isInt(t)) this.err(A[i], `'${name}' espera um inteiro, mas recebeu ${typeName(t)}`,
        t.k === 'real' ? 'Use trunc() ou round() para converter real em inteiro.' : undefined);
      return t;
    };
    const strArg = (i) => {
      const t = T(i);
      if (!isStrLike(t)) this.err(A[i], `'${name}' espera um texto (string), mas recebeu ${typeName(t)}`,
        isNum(t) ? 'Para converter número em texto use IntToStr() ou FloatToStr().' : undefined);
      return t;
    };
    const ordArg = (i) => {
      const t = T(i);
      if (!isOrdinal(t)) this.err(A[i], `'${name}' espera um valor ordinal (inteiro, char, boolean), mas recebeu ${typeName(t)}`);
      return t;
    };
    const lv = (i, io = false) => {
      if (!['id', 'index', 'field'].includes(A[i].kind)) {
        this.err(A[i], `'${name}' precisa de uma variável como argumento`);
        return this.expr(A[i], scope);
      }
      const t = this.lvalue(A[i], scope, io);
      A[i].byRef = true;
      return t;
    };

    switch (name) {
      case 'write':
      case 'writeln':
        for (let i = 0; i < A.length; i++) {
          const t = T(i);
          if (!['int', 'real', 'bool', 'char', 'str', 'enum', 'any'].includes(t.k)) {
            this.err(A[i], `Não é possível escrever um valor do tipo ${typeName(t)} diretamente`,
              t.k === 'array' ? 'Use um laço for para escrever cada posição: for i := 1 to n do write(v[i], \' \');' : 'Escreva cada campo separadamente.');
          }
          if (A[i].width) {
            const wt = this.expr(A[i].width, scope);
            if (!isInt(wt)) this.err(A[i].width, 'A largura (após :) deve ser um inteiro');
          }
          if (A[i].prec) {
            const pt = this.expr(A[i].prec, scope);
            if (!isInt(pt)) this.err(A[i].prec, 'O número de casas decimais deve ser um inteiro');
            if (t.k !== 'real' && t.k !== 'any' && t.k !== 'int') this.err(A[i], 'Casas decimais (:w:d) só se aplicam a números reais');
          }
          if (t.k === 'real' && !A[i].prec && !this.realWriteHint) {
            this.realWriteHint = true;
            this.warn(A[i], 'Valor real escrito sem formatação será exibido em notação científica (ex: 3.5000000000000000E+000)',
              'Use valor:0:2 para mostrar com 2 casas decimais. Ex: writeln(media:0:2);');
          }
        }
        return T_VOID;
      case 'read':
      case 'readln':
        for (let i = 0; i < A.length; i++) {
          const t = lv(i, true);
          if (!['int', 'real', 'char', 'str', 'any'].includes(t.k)) {
            this.err(A[i], `Não é possível ler um valor do tipo ${typeName(t)} com ${name}`,
              t.k === 'bool' ? 'Leia um número ou caractere e converta para boolean.' : t.k === 'array' ? 'Leia cada posição separadamente: readln(v[i]);' : undefined);
          }
        }
        return T_VOID;
      case 'clrscr': case 'randomize': case 'cursoroff': case 'cursoron': case 'clreol':
      case 'normvideo': case 'highvideo': case 'lowvideo': case 'nosound':
        need(0);
        return T_VOID;
      case 'halt':
        need(0, 1);
        if (A[0]) intArg(0);
        return T_VOID;
      case 'delay': case 'textcolor': case 'textbackground': case 'sound':
        need(1);
        if (A[0]) intArg(0);
        return T_VOID;
      case 'gotoxy':
        need(2);
        A.forEach((_, i) => intArg(i));
        return T_VOID;
      case 'inc':
      case 'dec': {
        need(1, 2);
        if (!A[0]) return T_VOID;
        const t = lv(0);
        A[0].sym && (A[0].sym.used = true);
        if (!isOrdinal(t)) this.err(A[0], `'${name}' só funciona com variáveis inteiras ou char (recebeu ${typeName(t)})`,
          t.k === 'real' ? `Para reais use x := x ${name === 'inc' ? '+' : '-'} 1;` : undefined);
        if (A[1]) intArg(1);
        return T_VOID;
      }
      case 'include':
      case 'exclude':
        need(2);
        lv(0);
        T(1);
        return T_VOID;
      case 'setlength': {
        need(2);
        const t = lv(0);
        if (t.k !== 'dynarray' && t.k !== 'str' && t.k !== 'any') this.err(A[0], 'setlength só funciona com arrays dinâmicos ou strings');
        intArg(1);
        return T_VOID;
      }
      case 'str': {
        need(2);
        numArg(0);
        if (A[0] && A[0].width) this.expr(A[0].width, scope);
        if (A[0] && A[0].prec) this.expr(A[0].prec, scope);
        const t = lv(1);
        if (t.k !== 'str' && t.k !== 'any') this.err(A[1], 'O segundo argumento de str deve ser uma variável string');
        return T_VOID;
      }
      case 'val': {
        need(3);
        strArg(0);
        const t = lv(1);
        if (!isNum(t)) this.err(A[1], 'O segundo argumento de val deve ser uma variável numérica');
        const ct = lv(2);
        if (!isInt(ct)) this.err(A[2], 'O terceiro argumento de val deve ser uma variável inteira (código de erro)');
        return T_VOID;
      }
      case 'insert': {
        need(3);
        strArg(0);
        const t = lv(1);
        if (t.k !== 'str' && t.k !== 'any') this.err(A[1], 'insert precisa de uma variável string');
        intArg(2);
        return T_VOID;
      }
      case 'delete': {
        need(3);
        const t = lv(0);
        if (t.k !== 'str' && t.k !== 'any') this.err(A[0], 'delete precisa de uma variável string');
        intArg(1);
        intArg(2);
        return T_VOID;
      }
      // ---------------- funções
      case 'abs':
      case 'sqr': {
        need(1);
        return A[0] ? numArg(0) : T_ANY;
      }
      case 'sqrt': case 'sin': case 'cos': case 'tan': case 'arctan': case 'ln': case 'exp':
      case 'int': case 'frac': case 'log10': case 'log2':
        need(1);
        if (A[0]) numArg(0);
        return T_REAL;
      case 'isnan':
        need(1);
        if (A[0]) numArg(0);
        return T_BOOL;
      case 'round': case 'trunc': case 'ceil': case 'floor':
        need(1);
        if (A[0]) numArg(0);
        return T_INT;
      case 'sign':
        need(1);
        if (A[0]) numArg(0);
        return T_INT;
      case 'pi':
        need(0);
        return T_REAL;
      case 'random':
        need(0, 1);
        if (A[0]) {
          intArg(0);
          return T_INT;
        }
        return T_REAL;
      case 'odd':
        need(1);
        if (A[0]) intArg(0);
        return T_BOOL;
      case 'ord':
        need(1);
        if (A[0]) ordArg(0);
        return T_INT;
      case 'chr':
        need(1);
        if (A[0]) intArg(0);
        return T_CHAR;
      case 'hi': case 'lo':
        need(1);
        if (A[0]) intArg(0);
        return T_INT;
      case 'succ':
      case 'pred':
        need(1);
        return A[0] ? ordArg(0) : T_ANY;
      case 'length': {
        need(1);
        if (!A[0]) return T_INT;
        const t = T(0);
        if (!isStrLike(t) && t.k !== 'array' && t.k !== 'dynarray') this.err(A[0], `'length' espera uma string ou array, mas recebeu ${typeName(t)}`,
          isNum(t) ? 'Para contar dígitos converta para texto: length(IntToStr(n)).' : undefined);
        return T_INT;
      }
      case 'high':
      case 'low': {
        need(1);
        if (!A[0]) return T_INT;
        const a = A[0];
        if (a.kind === 'id') {
          const s = scope.lookup(a.name);
          if (s && s.kind === 'type') {
            a.typeArg = s.type;
            if (s.type.k === 'array') return s.type.idx || T_INT;
            return s.type;
          }
        }
        const t = T(0);
        if (t.k === 'array') return t.idx && t.idx.k !== 'any' ? t.idx : T_INT;
        if (t.k === 'dynarray' || t.k === 'str') return T_INT;
        if (isOrdinal(t)) return t;
        this.err(a, `'${name}' espera um array, string ou tipo ordinal`);
        return T_INT;
      }
      case 'copy':
        need(2, 3);
        if (A[0]) strArg(0);
        if (A[1]) intArg(1);
        if (A[2]) intArg(2);
        return T_STR;
      case 'leftstr': case 'rightstr':
        need(2);
        if (A[0]) strArg(0);
        if (A[1]) intArg(1);
        return T_STR;
      case 'pos':
        need(2, 3);
        if (A[0]) strArg(0);
        if (A[1]) strArg(1);
        if (A[2]) intArg(2);
        return T_INT;
      case 'concat':
        need(1, Infinity);
        A.forEach((_, i) => strArg(i));
        return T_STR;
      case 'upcase': {
        need(1);
        if (!A[0]) return T_CHAR;
        const t = strArg(0);
        return t.k === 'char' ? T_CHAR : T_STR;
      }
      case 'lowercase': {
        need(1);
        if (!A[0]) return T_STR;
        const t = strArg(0);
        return t.k === 'char' ? T_CHAR : T_STR;
      }
      case 'uppercase': case 'trim': case 'trimleft': case 'trimright': case 'reversestring':
      case 'ansiuppercase': case 'ansilowercase':
        need(1);
        if (A[0]) strArg(0);
        return T_STR;
      case 'inttostr':
        need(1);
        if (A[0]) intArg(0);
        return T_STR;
      case 'floattostr':
        need(1);
        if (A[0]) numArg(0);
        return T_STR;
      case 'booltostr':
        need(1, 2);
        if (A[0]) T(0);
        if (A[1]) T(1);
        return T_STR;
      case 'strtoint':
        need(1);
        if (A[0]) strArg(0);
        return T_INT;
      case 'strtointdef':
        need(2);
        if (A[0]) strArg(0);
        if (A[1]) intArg(1);
        return T_INT;
      case 'strtofloat':
        need(1);
        if (A[0]) strArg(0);
        return T_REAL;
      case 'stringofchar':
        need(2);
        if (A[0]) T(0);
        if (A[1]) intArg(1);
        return T_STR;
      case 'formatfloat':
        need(2);
        if (A[0]) strArg(0);
        if (A[1]) numArg(1);
        return T_STR;
      case 'power':
        need(2);
        if (A[0]) numArg(0);
        if (A[1]) numArg(1);
        return T_REAL;
      case 'max':
      case 'min': {
        need(2);
        if (A.length < 2) return T_ANY;
        const a = numArg(0);
        const b = numArg(1);
        return a.k === 'real' || b.k === 'real' ? T_REAL : T_INT;
      }
      case 'readkey':
        need(0);
        e.async = true;
        return T_CHAR;
      case 'keypressed':
        need(0);
        return T_BOOL;
      case 'wherex': case 'wherey':
        need(0);
        return T_INT;
      default:
        this.err(e, `Rotina '${name}' não suportada`);
        return T_ANY;
    }
  }

  // ---------------------------------------------------------------- Comandos
  cond(e, scope, what) {
    const t = this.expr(e, scope);
    if (!isBool(t)) {
      let hint = 'A condição deve resultar em verdadeiro ou falso, ex: x > 0.';
      if (e.kind === 'bin' && (e.op === 'and' || e.op === 'or')) {
        hint = `Use parênteses em cada comparação: (a > 0) ${e.op} (b > 0)`;
      } else if (e.kind === 'assign') hint = "Para comparar use '=' (e não ':=').";
      this.err(e, `A condição do ${what} deve ser boolean, mas é ${typeName(t)}`, hint);
    }
  }

  stmts(list, scope) {
    for (const s of list) if (s) this.checkStmt(s, scope);
  }

  checkStmt(s, scope) {
    if (!s) return;
    switch (s.kind) {
      case 'compound':
        this.stmts(s.body, scope);
        break;
      case 'assign': {
        const tt = this.lvalue(s.target, scope);
        const vt = this.expr(s.value, scope);
        if (s.op !== ':=') {
          // x += y
          const okNum = isNum(tt) && isNum(vt) && !(tt.k === 'int' && (vt.k === 'real' || s.op === '/='));
          const okStr = s.op === '+=' && tt.k === 'str' && isStrLike(vt);
          if (!okNum && !okStr) this.err(s, `Operador ${s.op} incompatível com ${typeName(tt)} e ${typeName(vt)}`);
          if (s.target.sym) s.target.sym.used = true;
          break;
        }
        if (!assignable(tt, vt)) {
          let hint;
          if (tt.k === 'int' && vt.k === 'real') {
            hint = s.value.kind === 'bin' && s.value.op === '/'
              ? "A divisão '/' sempre resulta em real. Use 'div' para divisão inteira, ou declare a variável como real."
              : 'Use round() ou trunc() para converter, ou declare a variável como real.';
          } else if (isNum(tt) && vt.k === 'str') {
            hint = 'Para converter texto em número use StrToInt() / StrToFloat() ou val().';
          } else if (tt.k === 'str' && isNum(vt)) {
            hint = 'Para converter número em texto use IntToStr() / FloatToStr() ou str().';
          } else if (tt.k === 'char' && vt.k === 'str') {
            hint = "Uma variável char guarda só um caractere. Declare como string, ou use apenas um caractere: 'a'.";
          } else if (tt.k === 'char' && isNum(vt)) {
            hint = "Caracteres ficam entre apóstrofos: x := '5'; ou use chr(n).";
          } else if (tt.k === 'bool' && vt.k !== 'bool') {
            hint = 'Variáveis boolean recebem true, false ou uma comparação (ex: ok := x > 0).';
          }
          this.err(s.value.kind ? s.value : s, `Tipos incompatíveis: não é possível atribuir ${typeName(vt)} a uma variável ${typeName(tt)}`, hint);
        }
        break;
      }
      case 'call': {
        // procedimento (ou função usada como comando)
        const sym = scope.lookup(s.name);
        if (sym && sym.kind === 'var') {
          this.err(s, `'${sym.raw}' é uma variável, não um comando`,
            `Para atribuir um valor use: ${sym.raw} := valor;`);
          break;
        }
        if (sym && (sym.kind === 'const' || sym.kind === 'type')) {
          this.err(s, `'${s.nameRaw}' não é um comando`);
          break;
        }
        this.callExpr(s, scope, true);
        break;
      }
      case 'if':
        this.cond(s.cond, scope, 'if');
        this.checkStmt(s.then, scope);
        this.checkStmt(s.else, scope);
        break;
      case 'while':
        this.cond(s.cond, scope, 'while');
        this.loopDepth++;
        this.checkStmt(s.body, scope);
        this.loopDepth--;
        break;
      case 'repeat':
        this.loopDepth++;
        this.stmts(s.body, scope);
        this.loopDepth--;
        this.cond(s.cond, scope, 'until');
        break;
      case 'for': {
        const sym = scope.lookup(s.varName);
        let vt = T_ANY;
        if (!sym) this.undeclared(s, s.varName, scope, s.varRaw);
        else if (sym.kind !== 'var') this.err(s, `'${s.varRaw}' não é uma variável`);
        else {
          vt = sym.type;
          sym.used = true;
          sym.assigned = true;
          s.store = sym.store;
          s.varType = vt;
          if (!isOrdinal(vt)) {
            this.err(s, `A variável de controle do for deve ser inteira ou char (é ${typeName(vt)})`,
              vt.k === 'real' ? 'Declare a variável do for como integer.' : undefined);
          }
          if (sym.mode === 'var') {
            // permitido em FPC? Não: deve ser variável local
          }
        }
        const ft = this.expr(s.from, scope);
        const tt = this.expr(s.to, scope);
        if (!assignable(vt, ft)) this.err(s.from, `Valor inicial do for (${typeName(ft)}) incompatível com a variável (${typeName(vt)})`);
        if (!assignable(vt, tt)) this.err(s.to, `Valor final do for (${typeName(tt)}) incompatível com a variável (${typeName(vt)})`,
          tt.k === 'real' ? 'Use trunc() ou round() no valor final.' : undefined);
        this.loopDepth++;
        if (sym) this.forVars.add(sym);
        this.checkStmt(s.body, scope);
        if (sym) this.forVars.delete(sym);
        this.loopDepth--;
        break;
      }
      case 'case': {
        const t = this.expr(s.expr, scope);
        if (!isOrdinal(t) && t.k !== 'str') {
          this.err(s.expr, `O seletor do case deve ser inteiro, char ou string (é ${typeName(t)})`,
            t.k === 'real' ? 'Números reais não podem ser usados no case. Use if/else.' : undefined);
        }
        const seen = new Set();
        for (const b of s.branches) {
          for (const lab of b.labels) {
            const lo = this.evalConst(lab.lo, scope);
            lab.lov = t.k === 'str' ? String(lo.value) : ordOf(lo.value);
            if (!assignable(t, lo.type) && !(t.k === 'str' && lo.type.k === 'char') && !(t.k === 'char' && lo.type.k === 'char')) {
              this.err(lab.lo, `Valor do case (${typeName(lo.type)}) incompatível com o seletor (${typeName(t)})`,
                t.k === 'char' ? "Caracteres ficam entre apóstrofos, ex: 'a':" : undefined);
            }
            if (lab.hi) {
              const hi = this.evalConst(lab.hi, scope);
              lab.hiv = ordOf(hi.value);
            } else {
              const key = String(lab.lov);
              if (seen.has(key)) this.err(lab.lo, `Valor repetido no case: ${lo.type.k === 'char' || lo.type.k === 'str' ? `'${lo.value}'` : lo.value}`);
              seen.add(key);
            }
          }
          this.checkStmt(b.body, scope);
        }
        if (s.else) this.stmts(s.else, scope);
        break;
      }
      case 'break':
      case 'continue':
        if (this.loopDepth === 0) this.err(s, `'${s.kind}' só pode ser usado dentro de um laço (for, while, repeat)`);
        break;
      case 'exit':
        if (s.value) {
          const owner = scope.owner;
          if (!owner || !owner.isFunc) this.err(s, 'exit(valor) só pode ser usado dentro de funções');
          else {
            const vt = this.expr(s.value, scope);
            if (!assignable(owner.ret, vt)) this.err(s.value, `exit: esperado ${typeName(owner.ret)}, recebeu ${typeName(vt)}`);
            owner.resultSym.assigned = true;
            s.store = owner.resultSym.store;
          }
        }
        break;
      default:
        break;
    }
  }
}

export function analyze(ast) {
  return new Analyzer().analyze(ast);
}
