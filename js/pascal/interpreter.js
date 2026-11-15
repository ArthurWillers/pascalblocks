// Interpretador assíncrono da AST anotada (permite readln, passo a passo e botão Parar).
import { PascalRuntimeError, StopSignal } from './errors.js';
import { defaultValue, copyValue, ordOf, fromOrd, typeName } from './types.js';
import { binop, unop } from './ops.js';

class Cell {
  constructor(v) {
    this.v = v;
  }
  get() {
    return this.v;
  }
  set(x) {
    this.v = x;
  }
}

class Env {
  constructor(parent, owner, name) {
    this.parent = parent;
    this.owner = owner; // símbolo da rotina (null = programa)
    this.name = name;
    this.vars = new Map();
    this.types = new Map();
    this.display = []; // nomes visíveis no painel de variáveis
  }
  lookup(store) {
    for (let e = this; e; e = e.parent) {
      const c = e.vars.get(store);
      if (c) return c;
    }
    return null;
  }
}

const BREAK = 1;
const CONTINUE = 2;
const EXIT = 3;

const CRT_COLORS = [
  '#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa',
  '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff',
];

/** Formata um real como o Free Pascal faz em writeln(x) sem formatação. */
export function fpcReal(v, width) {
  if (Number.isNaN(v)) return 'Nan';
  if (!Number.isFinite(v)) return v > 0 ? '+Inf' : '-Inf';
  let digits = 16;
  if (width !== undefined && width !== null) digits = Math.max(1, Math.min(16, width - 8));
  const s = Math.abs(v).toExponential(digits);
  const [mant, exp] = s.split('e');
  const expNum = parseInt(exp, 10);
  const expStr = (expNum < 0 ? '-' : '+') + String(Math.abs(expNum)).padStart(3, '0');
  return (v < 0 || Object.is(v, -0) ? '-' : ' ') + mant + 'E' + expStr;
}

export function formatValue(v, ty, width, prec) {
  let s;
  const k = ty ? ty.k : typeof v === 'number' ? 'int' : 'str';
  if (prec !== undefined && prec !== null && typeof v === 'number') {
    const p = Math.max(0, Math.min(20, prec));
    s = v.toFixed(p);
    if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
  } else if (k === 'real') {
    s = fpcReal(v, width);
  } else if (k === 'bool') {
    s = v ? 'TRUE' : 'FALSE';
  } else if (k === 'enum') {
    s = ty.names[v] !== undefined ? ty.names[v] : String(v);
  } else if (k === 'char') {
    s = v === '\0' ? '' : String(v);
  } else {
    s = String(v);
  }
  if (width && s.length < width) s = s.padStart(width, ' ');
  return s;
}

/** Representação de valores para o painel de variáveis. */
export function displayValue(v, ty, depth = 0) {
  if (!ty) return String(v);
  switch (ty.k) {
    case 'int': return String(v);
    case 'real': {
      if (Number.isInteger(v)) return v.toFixed(1);
      return String(Math.round(v * 1e10) / 1e10);
    }
    case 'bool': return v ? 'true' : 'false';
    case 'char': return v === '\0' ? "#0" : `'${v}'`;
    case 'str': return `'${v}'`;
    case 'enum': return ty.names[v] || String(v);
    case 'set': return `[${[...v].sort((a, b) => a - b).map((x) => fromOrdDisplay(ty.elem, x)).join(', ')}]`;
    case 'array':
    case 'dynarray': {
      if (depth > 2) return '[...]';
      const items = v.data.slice(0, 50).map((x) => displayValue(x, ty.elem, depth + 1));
      return `[${items.join(', ')}${v.data.length > 50 ? ', …' : ''}]`;
    }
    case 'record': {
      if (depth > 2) return '(...)';
      return '(' + [...ty.fields.entries()].map(([n, ft]) => `${n}: ${displayValue(v[n], ft, depth + 1)}`).join('; ') + ')';
    }
    default: return String(v);
  }
}

function fromOrdDisplay(t, n) {
  if (t.k === 'char') return `'${String.fromCharCode(n)}'`;
  if (t.k === 'enum') return t.names[n];
  if (t.k === 'bool') return n ? 'true' : 'false';
  return String(n);
}

// setTimeout garante que eventos da interface (ex: botão Parar) sejam processados.
const nextTick = () => new Promise((r) => setTimeout(r, 0));

export class Interpreter {
  /**
   * io: { write(text), clear(), readLine(): Promise<string>, readKey(): Promise<string>,
   *       setTextColor(c), setBackground(c), gotoxy(x,y) }
   */
  constructor(ast, io, options = {}) {
    this.ast = ast;
    this.io = io;
    this.onStep = options.onStep || null; // async (line, interp) => void
    this.maxDepth = options.maxDepth || 3000;
    this.stopRequested = false;
    this.depth = 0;
    this.stack = [];
    this.inputLine = null;
    this.inputPos = 0;
    this.lastYield = 0;
    this.steps = 0;
    this.currentLine = 0;
    this.fg = 7;
    this.bg = 0;
    this.lastOutputChar = '\n';
  }

  stop() {
    this.stopRequested = true;
  }

  rt(msg, node, code, hint) {
    return new PascalRuntimeError(msg, node ? node.line : this.currentLine, code, hint);
  }

  async run() {
    const env = new Env(null, null, 'programa');
    this.global = env;
    this.stack = [env];
    this.initVars(this.ast.block, env);
    this.lastYield = performance.now();
    try {
      await this.exec(this.ast.block.body, env);
    } catch (e) {
      if (e instanceof StopSignal && e.reason === 'halt') return { halted: true };
      throw e;
    }
    return { halted: false };
  }

  initVars(block, env) {
    for (const v of block.vars) {
      env.vars.set(v.name, new Cell(v.init !== null && v.init !== undefined ? copyValue(v.init) : defaultValue(v.type)));
      env.types.set(v.name, v.type);
      env.display.push(v.name);
    }
  }

  /** Estado das variáveis visíveis para o painel de depuração. */
  snapshot() {
    const scopes = [];
    const top = this.stack[this.stack.length - 1];
    const seen = new Set();
    for (let e = top; e; e = e.parent) {
      const vars = [];
      for (const name of e.display) {
        if (seen.has(name)) continue;
        seen.add(name);
        const cell = e.vars.get(name);
        const ty = e.types.get(name);
        let label = name;
        if (name.startsWith('#res:')) label = 'Result';
        vars.push({ name: label, type: typeName(ty), value: displayValue(cell.get(), ty) });
      }
      scopes.push({ name: e.name, vars });
    }
    return scopes;
  }

  callStack() {
    return this.stack.map((e) => e.name);
  }

  // ---------------------------------------------------------------- Comandos
  /** Cede o controle à interface de tempos em tempos (permite o botão Parar). */
  async tick() {
    if (this.stopRequested) throw new StopSignal('stop');
    if ((++this.steps & 1023) === 0) {
      const now = performance.now();
      if (now - this.lastYield > 25) {
        await nextTick();
        this.lastYield = performance.now();
        if (this.stopRequested) throw new StopSignal('stop');
      }
    }
  }

  async exec(s, env) {
    await this.tick();
    if (!s) return 0;
    if (s.kind !== 'compound') {
      this.currentLine = s.line;
      if (this.onStep) await this.onStep(s.line, this);
    }
    switch (s.kind) {
      case 'compound':
        for (const st of s.body) {
          const r = await this.exec(st, env);
          if (r) return r;
        }
        return 0;
      case 'assign':
        return this.execAssign(s, env);
      case 'call':
        return this.execCall(s, env);
      case 'if': {
        const c = await this.eva(s.cond, env);
        if (c) return this.exec(s.then, env);
        return this.exec(s.else, env);
      }
      case 'while':
        for (let first = true; ; first = false) {
          if (!first && this.onStep) await this.onStep(s.line, this);
          await this.tick();
          if (!(await this.eva(s.cond, env))) break;
          const r = await this.exec(s.body, env);
          if (r === BREAK) break;
          if (r === EXIT) return EXIT;
        }
        return 0;
      case 'repeat':
        for (;;) {
          await this.tick();
          let brk = false;
          for (const st of s.body) {
            const r = await this.exec(st, env);
            if (r === BREAK) {
              brk = true;
              break;
            }
            if (r === EXIT) return EXIT;
            if (r === CONTINUE) break;
          }
          if (brk) break;
          if (this.onStep) await this.onStep(s.cond.line, this);
          if (await this.eva(s.cond, env)) break;
        }
        return 0;
      case 'for': {
        const cell = env.lookup(s.store);
        const from = ordOf(await this.eva(s.from, env));
        const to = ordOf(await this.eva(s.to, env));
        const vt = s.varType;
        if (s.down) {
          for (let i = from; i >= to; i--) {
            if (i !== from && this.onStep) await this.onStep(s.line, this);
            cell.set(fromOrd(vt, i));
            const r = await this.exec(s.body, env);
            if (r === BREAK) break;
            if (r === EXIT) return EXIT;
          }
        } else {
          for (let i = from; i <= to; i++) {
            if (i !== from && this.onStep) await this.onStep(s.line, this);
            cell.set(fromOrd(vt, i));
            const r = await this.exec(s.body, env);
            if (r === BREAK) break;
            if (r === EXIT) return EXIT;
          }
        }
        return 0;
      }
      case 'case': {
        const v = await this.eva(s.expr, env);
        const key = typeof v === 'string' && s.expr.ty.k === 'str' ? v : ordOf(v);
        for (const b of s.branches) {
          for (const lab of b.labels) {
            const hit = lab.hiv !== undefined && lab.hi ? key >= lab.lov && key <= lab.hiv : key === lab.lov;
            if (hit) return this.exec(b.body, env);
          }
        }
        if (s.else) {
          for (const st of s.else) {
            const r = await this.exec(st, env);
            if (r) return r;
          }
        }
        return 0;
      }
      case 'break':
        return BREAK;
      case 'continue':
        return CONTINUE;
      case 'exit':
        if (s.value) {
          const v = await this.eva(s.value, env);
          env.lookup(s.store).set(copyValue(v));
        }
        return EXIT;
      default:
        return 0;
    }
  }

  async execAssign(s, env) {
    const ref = s.target.async ? await this.refA(s.target, env) : this.ref(s.target, env);
    let v = await this.eva(s.value, env);
    if (s.op !== ':=') {
      const cur = ref.get();
      const op = s.op[0];
      v = binop(op, cur, v, s.target.ty, s.value.ty, s.line);
      if (s.target.ty.k === 'int') v = Math.trunc(v);
    }
    this.store(ref, v, s.target.ty, s);
    return 0;
  }

  store(ref, v, ty, node) {
    if (ty && ty.k === 'int' && typeof v === 'number' && !Number.isInteger(v)) v = Math.trunc(v);
    if (ty && ty.k === 'char' && typeof v === 'string' && v.length !== 1) {
      throw this.rt('Atribuição de texto a char', node);
    }
    ref.set(copyValue(v));
  }

  async execCall(s, env) {
    if (s.routine) {
      await this.callUser(s, env);
      return 0;
    }
    if (s.builtin) {
      const args = await this.evalArgs(s, env);
      if (s.builtin === 'write' || s.builtin === 'writeln' || s.builtin === 'read' ||
        s.builtin === 'readln' || s.builtin === 'delay' || s.builtin === 'readkey' || s.builtin === 'halt' ||
        s.builtin === 'clrscr') {
        await this.asyncProc(s.builtin, s, args, env);
      } else {
        this.builtin(s.builtin, s, args, env);
      }
    }
    return 0;
  }

  async evalArgs(e, env) {
    const out = new Array(e.args.length);
    for (let i = 0; i < e.args.length; i++) {
      const a = e.args[i];
      if (a.byRef) out[i] = a.async ? await this.refA(a, env) : this.ref(a, env);
      else out[i] = await this.eva(a, env);
    }
    return out;
  }

  evalArgsSync(e, env) {
    return e.args.map((a) => (a.byRef ? this.ref(a, env) : this.ev(a, env)));
  }

  async callUser(e, env) {
    const r = e.routine;
    const d = r.node;
    if (this.depth >= this.maxDepth) {
      throw this.rt(`Estouro de pilha: recursão muito profunda em '${r.raw}'`, e, 202,
        'A função chama a si mesma vezes demais. Verifique se existe um caso base que encerra a recursão.');
    }
    // avalia argumentos no ambiente do chamador
    const vals = new Array(r.params.length);
    for (let i = 0; i < r.params.length; i++) {
      const p = r.params[i];
      const a = e.args[i];
      if (!a) vals[i] = this.ev(p.def, env);
      else if (p.mode === 'var') vals[i] = a.async ? await this.refA(a, env) : this.ref(a, env);
      else vals[i] = await this.eva(a, env);
    }
    // encontra o ambiente estático (onde a rotina foi declarada)
    let parent = env;
    while (parent && parent.owner !== r.parentOwner) parent = parent.parent;
    const fenv = new Env(parent || this.global, r, r.raw);
    r.params.forEach((p, i) => {
      if (p.mode === 'var') fenv.vars.set(p.name, vals[i]);
      else fenv.vars.set(p.name, new Cell(copyValue(vals[i])));
      fenv.types.set(p.name, p.type);
      fenv.display.push(p.name);
    });
    let resStore = null;
    if (r.isFunc) {
      resStore = '#res:' + r.name;
      fenv.vars.set(resStore, new Cell(defaultValue(r.ret)));
      fenv.types.set(resStore, r.ret);
      fenv.display.push(resStore);
    }
    this.initVars(d.block, fenv);
    this.depth++;
    this.stack.push(fenv);
    const savedLine = this.currentLine;
    try {
      await this.exec(d.block.body, fenv);
    } finally {
      this.depth--;
      this.stack.pop();
      this.currentLine = savedLine;
    }
    return resStore ? fenv.vars.get(resStore).get() : undefined;
  }

  // ---------------------------------------------------------------- Referências (lvalues)
  async refA(e, env) {
    const pre = new Map();
    const walk = async (n) => {
      if (n.kind === 'index') {
        await walk(n.target);
        const vals = [];
        for (const ix of n.indices) vals.push(await this.eva(ix, env));
        pre.set(n, vals);
      } else if (n.kind === 'field') await walk(n.target);
    };
    await walk(e);
    return this.ref(e, env, pre);
  }

  ref(e, env, pre) {
    switch (e.kind) {
      case 'id': {
        const c = env.lookup(e.store);
        if (!c) throw this.rt(`Variável '${e.raw}' indisponível`, e);
        return c;
      }
      case 'field': {
        const base = this.ref(e.target, env, pre);
        const name = e.name;
        return {
          get: () => base.get()[name],
          set: (x) => {
            base.get()[name] = x;
          },
        };
      }
      case 'index': {
        let r = this.ref(e.target, env, pre);
        const idxVals = pre && pre.get(e) ? pre.get(e) : e.indices.map((ix) => this.ev(ix, env));
        for (let k = 0; k < e.indices.length; k++) {
          const dim = e.dims[k];
          const raw = idxVals[k];
          const i = ordOf(raw);
          if (dim.kind === 'str') {
            const parent = r;
            const s0 = parent.get();
            if (i < 1 || i > s0.length) {
              throw this.rt(`Índice ${i} fora dos limites da string (tamanho ${s0.length})`, e, 201,
                'Posições de strings começam em 1 e vão até length(s).');
            }
            r = {
              get: () => parent.get()[i - 1],
              set: (ch) => {
                const s = parent.get();
                parent.set(s.slice(0, i - 1) + ch + s.slice(i));
              },
            };
          } else {
            const arr = r.get();
            const j = this.arrIndex(arr, i, dim, e, raw);
            r = {
              get: () => arr.data[j],
              set: (x) => {
                arr.data[j] = x;
              },
            };
          }
        }
        return r;
      }
      default:
        throw this.rt('Esperada uma variável', e);
    }
  }

  arrIndex(arr, i, dim, e, raw) {
    const j = i - arr.lo;
    if (j < 0 || j >= arr.data.length) {
      const name = this.exprName(e);
      const shown = typeof raw === 'string' ? `'${raw}'` : String(i);
      if (dim.kind === 'dyn') {
        throw this.rt(`Índice ${shown} fora dos limites em ${name} (o array tem ${arr.data.length} posições: 0..${arr.data.length - 1})`, e, 201,
          arr.data.length === 0 ? 'Use setlength() para definir o tamanho do array antes de usá-lo.' : undefined);
      }
      throw this.rt(`Índice ${shown} fora dos limites em ${name} (válido: ${dim.loLabel}..${dim.hiLabel})`, e, 201,
        'Verifique os limites dos laços que percorrem o array.');
    }
    return j;
  }

  exprName(e) {
    let n = e;
    while (n.kind === 'index' || n.kind === 'field') n = n.target;
    return n.raw || n.name || 'array';
  }

  // ---------------------------------------------------------------- Expressões
  async eva(e, env) {
    if (!e.async) return this.ev(e, env);
    switch (e.kind) {
      case 'un':
        return unop(e.op, await this.eva(e.expr, env));
      case 'bin': {
        const a = await this.eva(e.left, env);
        if (e.op === 'and' && a === false) return false;
        if (e.op === 'or' && a === true) return true;
        const b = await this.eva(e.right, env);
        return binop(e.rop || e.op, a, b, e.left.ty, e.right.ty, e.line);
      }
      case 'call': {
        if (e.routine) return this.callUser(e, env);
        if (e.builtin === 'readkey') return this.readKey();
        const args = await this.evalArgs(e, env);
        if (e.cast) return this.cast(e, args[0]);
        return this.builtin(e.builtin, e, args, env);
      }
      case 'index':
      case 'field':
        return (await this.refA(e, env)).get();
      case 'set': {
        const s = new Set();
        for (const el of e.elems) {
          const lo = ordOf(await this.eva(el.lo, env));
          if (el.hi) {
            const hi = ordOf(await this.eva(el.hi, env));
            for (let i = lo; i <= hi; i++) s.add(i);
          } else s.add(lo);
        }
        return s;
      }
      default:
        return this.ev(e, env);
    }
  }

  ev(e, env) {
    switch (e.kind) {
      case 'num':
        return e.value;
      case 'str':
        return e.value;
      case 'id':
        if (e.ref === 'const') return e.cv;
        return env.lookup(e.store).get();
      case 'un':
        return unop(e.op, this.ev(e.expr, env));
      case 'bin': {
        const a = this.ev(e.left, env);
        if (e.op === 'and' && a === false) return false;
        if (e.op === 'or' && a === true) return true;
        return binop(e.rop || e.op, a, this.ev(e.right, env), e.left.ty, e.right.ty, e.line);
      }
      case 'index':
        return this.getIndexed(e, env);
      case 'field': {
        const rec = this.ev(e.target, env);
        return rec[e.name];
      }
      case 'call': {
        if (e.routine || e.builtin === 'readkey') throw this.rt('Chamada assíncrona em contexto síncrono', e);
        const args = this.evalArgsSync(e, env);
        if (e.cast) return this.cast(e, args[0]);
        return this.builtin(e.builtin, e, args, env);
      }
      case 'set': {
        const s = new Set();
        for (const el of e.elems) {
          const lo = ordOf(this.ev(el.lo, env));
          if (el.hi) {
            const hi = ordOf(this.ev(el.hi, env));
            for (let i = lo; i <= hi; i++) s.add(i);
          } else s.add(lo);
        }
        return s;
      }
      default:
        throw this.rt('Expressão não suportada: ' + e.kind, e);
    }
  }

  getIndexed(e, env) {
    let v = this.ev(e.target, env);
    for (let k = 0; k < e.indices.length; k++) {
      const dim = e.dims[k];
      const raw = this.ev(e.indices[k], env);
      const i = ordOf(raw);
      if (dim.kind === 'str') {
        if (i < 1 || i > v.length) {
          throw this.rt(`Índice ${i} fora dos limites da string (tamanho ${v.length})`, e, 201,
            'Posições de strings começam em 1 e vão até length(s).');
        }
        v = v[i - 1];
      } else {
        v = v.data[this.arrIndex(v, i, dim, e, raw)];
      }
    }
    return v;
  }

  cast(e, v) {
    const t = e.cast;
    switch (t.k) {
      case 'int': return typeof v === 'number' ? Math.trunc(v) : ordOf(v);
      case 'char': return typeof v === 'string' ? v : String.fromCharCode(ordOf(v));
      case 'bool': return typeof v === 'boolean' ? v : ordOf(v) !== 0;
      case 'real': return Number(v);
      case 'enum': return ordOf(v);
      case 'str': return String(v);
      default: return v;
    }
  }

  // ---------------------------------------------------------------- Entrada / Saída
  out(text) {
    if (!text) return;
    this.io.write(text, this.fg, this.bg);
    this.lastOutputChar = text[text.length - 1];
  }

  async ensureLine() {
    if (this.inputLine === null) {
      this.inputLine = await this.io.readLine();
      this.inputPos = 0;
      if (this.stopRequested) throw new StopSignal('stop');
    }
  }

  async readToken() {
    for (;;) {
      await this.ensureLine();
      while (this.inputPos < this.inputLine.length && /\s/.test(this.inputLine[this.inputPos])) this.inputPos++;
      if (this.inputPos < this.inputLine.length) break;
      this.inputLine = null; // linha acabou, pede outra
    }
    const st = this.inputPos;
    while (this.inputPos < this.inputLine.length && !/\s/.test(this.inputLine[this.inputPos])) this.inputPos++;
    return this.inputLine.slice(st, this.inputPos);
  }

  async readInto(ref, ty, node) {
    switch (ty.k) {
      case 'int': {
        const tok = await this.readToken();
        if (!/^[+-]?(\d+|\$[0-9a-fA-F]+)$/.test(tok)) {
          throw this.rt(`Entrada inválida: '${tok}' não é um número inteiro`, node, 106,
            /^[+-]?\d*[.,]\d+$/.test(tok) ? 'A variável é integer; digite um número sem casas decimais (ou declare como real).' : 'Digite apenas dígitos, ex: 42');
        }
        ref.set(tok.includes('$') ? parseInt(tok.replace('$', ''), 16) * (tok[0] === '-' ? -1 : 1) : parseInt(tok, 10));
        break;
      }
      case 'real': {
        const tok = await this.readToken();
        if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(tok)) {
          throw this.rt(`Entrada inválida: '${tok}' não é um número real`, node, 106,
            tok.includes(',') ? 'Use ponto como separador decimal: 7.5 (e não 7,5).' : 'Digite um número, ex: 3.14');
        }
        ref.set(parseFloat(tok));
        break;
      }
      case 'char': {
        await this.ensureLine();
        if (this.inputPos < this.inputLine.length) ref.set(this.inputLine[this.inputPos++]);
        else {
          ref.set('\n');
          this.inputLine = null;
        }
        break;
      }
      case 'str': {
        await this.ensureLine();
        ref.set(this.inputLine.slice(this.inputPos));
        this.inputPos = this.inputLine.length;
        break;
      }
      default:
        throw this.rt(`Não é possível ler ${typeName(ty)}`, node);
    }
  }

  async readKey() {
    if (this.inputLine !== null && this.inputPos < this.inputLine.length) return this.inputLine[this.inputPos++];
    const k = await this.io.readKey();
    if (this.stopRequested) throw new StopSignal('stop');
    return k;
  }

  async asyncProc(name, e, args, env) {
    switch (name) {
      case 'write':
      case 'writeln': {
        let text = '';
        for (let i = 0; i < e.args.length; i++) {
          const a = e.args[i];
          const w = a.width ? await this.eva(a.width, env) : null;
          const p = a.prec ? await this.eva(a.prec, env) : null;
          text += formatValue(args[i], a.ty, w, p);
        }
        if (name === 'writeln') text += '\n';
        this.out(text);
        return;
      }
      case 'read':
      case 'readln':
        for (let i = 0; i < e.args.length; i++) await this.readInto(args[i], e.args[i].ty, e);
        if (name === 'readln') {
          if (e.args.length === 0) await this.ensureLine();
          this.inputLine = null;
        }
        return;
      case 'delay': {
        const ms = Math.max(0, Math.min(args[0], 10000));
        if (ms > 0) await new Promise((r) => setTimeout(r, ms));
        this.lastYield = performance.now();
        if (this.stopRequested) throw new StopSignal('stop');
        return;
      }
      case 'readkey':
        await this.readKey();
        return;
      case 'halt':
        throw new StopSignal('halt');
      case 'clrscr':
        this.io.clear(this.bg);
        return;
      default:
    }
  }

  builtin(name, e, A, env) {
    const line = e.line;
    switch (name) {
      // ----- procedimentos
      case 'randomize':
      case 'cursoroff':
      case 'cursoron':
      case 'clreol':
      case 'sound':
      case 'nosound':
        return;
      case 'normvideo':
        this.fg = 7;
        this.bg = 0;
        this.io.setColors && this.io.setColors(null, null);
        return;
      case 'highvideo':
        this.fg = this.fg | 8;
        return;
      case 'lowvideo':
        this.fg = this.fg & 7;
        return;
      case 'textcolor':
        this.fg = A[0] & 15;
        return;
      case 'textbackground':
        this.bg = A[0] & 7;
        return;
      case 'gotoxy':
        if (this.io.gotoxy) this.io.gotoxy(A[0], A[1]);
        return;
      case 'inc':
      case 'dec': {
        const r = A[0];
        const n = A.length > 1 ? A[1] : 1;
        const t = e.args[0].ty;
        const cur = ordOf(r.get());
        r.set(fromOrd(t, name === 'inc' ? cur + n : cur - n));
        return;
      }
      case 'include': {
        A[0].get().add(ordOf(A[1]));
        return;
      }
      case 'exclude': {
        A[0].get().delete(ordOf(A[1]));
        return;
      }
      case 'setlength': {
        const t = e.args[0].ty;
        const n = Math.max(0, A[1]);
        if (t.k === 'str') {
          const s = A[0].get();
          A[0].set(s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
        } else {
          const arr = A[0].get();
          const old = arr.data;
          const data = new Array(n);
          for (let i = 0; i < n; i++) data[i] = i < old.length ? old[i] : defaultValue(t.elem);
          A[0].set({ lo: 0, data });
        }
        return;
      }
      case 'str': {
        const a = e.args[0];
        const w = a.width ? this.ev(a.width, env) : null;
        const p = a.prec ? this.ev(a.prec, env) : null;
        A[1].set(formatValue(A[0], a.ty, w, p));
        return;
      }
      case 'val': {
        const s = String(A[0]).trim();
        const t = e.args[1].ty;
        const ok = t.k === 'int' ? /^[+-]?\d+$/.test(s) : /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s);
        if (ok) {
          A[1].set(t.k === 'int' ? parseInt(s, 10) : parseFloat(s));
          A[2].set(0);
        } else {
          let pos = 1;
          const m = s.match(t.k === 'int' ? /^[+-]?\d*/ : /^[+-]?\d*\.?\d*/);
          if (m) pos = m[0].length + 1;
          A[2].set(pos);
        }
        return;
      }
      case 'insert': {
        const s = A[1].get();
        const idx = Math.max(1, A[2]);
        A[1].set(s.slice(0, idx - 1) + A[0] + s.slice(idx - 1));
        return;
      }
      case 'delete': {
        const s = A[0].get();
        const idx = A[1];
        const cnt = A[2];
        if (idx < 1 || idx > s.length || cnt <= 0) return;
        A[0].set(s.slice(0, idx - 1) + s.slice(idx - 1 + cnt));
        return;
      }
      // ----- funções
      case 'abs':
        return Math.abs(A[0]);
      case 'sqr':
        return A[0] * A[0];
      case 'sqrt':
        if (A[0] < 0) throw this.rt(`Raiz quadrada de número negativo: sqrt(${A[0]})`, e, 207, 'Não existe raiz quadrada real de número negativo.');
        return Math.sqrt(A[0]);
      case 'sin': return Math.sin(A[0]);
      case 'cos': return Math.cos(A[0]);
      case 'tan': return Math.tan(A[0]);
      case 'arctan': return Math.atan(A[0]);
      case 'ln':
        if (A[0] <= 0) throw this.rt(`Logaritmo de número não positivo: ln(${A[0]})`, e, 207);
        return Math.log(A[0]);
      case 'log10': return Math.log10(A[0]);
      case 'log2': return Math.log2(A[0]);
      case 'exp': return Math.exp(A[0]);
      case 'isnan': return Number.isNaN(A[0]);
      case 'round': {
        // Pascal usa arredondamento bancário (round half to even)
        const x = A[0];
        const f = Math.floor(x);
        const diff = x - f;
        if (diff === 0.5) return f % 2 === 0 ? f : f + 1;
        return Math.round(x);
      }
      case 'trunc': return Math.trunc(A[0]);
      case 'ceil': return Math.ceil(A[0]);
      case 'floor': return Math.floor(A[0]);
      case 'sign': return Math.sign(A[0]);
      case 'int': return Math.trunc(A[0]);
      case 'frac': return A[0] - Math.trunc(A[0]);
      case 'pi': return Math.PI;
      case 'random':
        if (A.length) return Math.floor(Math.random() * Math.max(0, A[0]));
        return Math.random();
      case 'odd': return Math.abs(A[0]) % 2 === 1;
      case 'ord': return ordOf(A[0]);
      case 'chr': return String.fromCharCode(A[0] & 0xffff);
      case 'hi': return (A[0] >> 8) & 0xff;
      case 'lo': return A[0] & 0xff;
      case 'succ':
      case 'pred': {
        const t = e.args[0].ty;
        return fromOrd(t, ordOf(A[0]) + (name === 'succ' ? 1 : -1));
      }
      case 'length': {
        const v = A[0];
        if (typeof v === 'string') return v.length;
        return v.data.length;
      }
      case 'high':
      case 'low': {
        const a = e.args[0];
        const t = a.typeArg || a.ty;
        const hi = name === 'high';
        if (t.k === 'array') return fromOrd(t.idx || { k: 'int' }, hi ? t.hi : t.lo);
        if (t.k === 'dynarray') return hi ? A[0].data.length - 1 : 0;
        if (t.k === 'str') return hi ? (A[0] ? A[0].length : 255) : 1;
        if (t.k === 'int') return hi ? 2147483647 : -2147483648;
        if (t.k === 'char') return hi ? '\xff' : '\0';
        if (t.k === 'bool') return hi;
        if (t.k === 'enum') return hi ? t.names.length - 1 : 0;
        return 0;
      }
      case 'copy': {
        const s = String(A[0]);
        let idx = A[1];
        let cnt = A.length > 2 ? A[2] : s.length;
        if (idx < 1) {
          cnt += idx - 1;
          idx = 1;
        }
        if (cnt <= 0 || idx > s.length) return '';
        return s.substr(idx - 1, cnt);
      }
      case 'leftstr': return String(A[0]).slice(0, Math.max(0, A[1]));
      case 'rightstr': return A[1] <= 0 ? '' : String(A[0]).slice(-A[1]);
      case 'pos': {
        const from = A.length > 2 ? Math.max(1, A[2]) : 1;
        if (A[0] === '') return 0;
        return String(A[1]).indexOf(String(A[0]), from - 1) + 1;
      }
      case 'concat': return A.map(String).join('');
      case 'upcase': return String(A[0]).replace(/[a-z]/g, (c) => c.toUpperCase());
      case 'lowercase': return String(A[0]).replace(/[A-Z]/g, (c) => c.toLowerCase());
      case 'uppercase': return String(A[0]).replace(/[a-z]/g, (c) => c.toUpperCase());
      case 'ansiuppercase': return String(A[0]).toUpperCase();
      case 'ansilowercase': return String(A[0]).toLowerCase();
      case 'trim': return String(A[0]).replace(/^[\s\0-\x1f]+|[\s\0-\x1f]+$/g, '');
      case 'trimleft': return String(A[0]).replace(/^[\s\0-\x1f]+/, '');
      case 'trimright': return String(A[0]).replace(/[\s\0-\x1f]+$/, '');
      case 'reversestring': return [...String(A[0])].reverse().join('');
      case 'inttostr': return String(A[0]);
      case 'floattostr': {
        const v = A[0];
        if (Number.isInteger(v)) return String(v);
        return String(parseFloat(v.toPrecision(15)));
      }
      case 'booltostr':
        if (A.length > 1 && A[1]) return A[0] ? 'True' : 'False';
        return A[0] ? '-1' : '0';
      case 'strtoint': {
        const s = String(A[0]).trim();
        if (!/^[+-]?\d+$/.test(s)) {
          throw this.rt(`"${A[0]}" não é um inteiro válido (StrToInt)`, e, 106, 'Use StrToIntDef(texto, padrao) para evitar o erro, ou val().');
        }
        return parseInt(s, 10);
      }
      case 'strtointdef': {
        const s = String(A[0]).trim();
        return /^[+-]?\d+$/.test(s) ? parseInt(s, 10) : A[1];
      }
      case 'strtofloat': {
        const s = String(A[0]).trim();
        if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) {
          throw this.rt(`"${A[0]}" não é um número real válido (StrToFloat)`, e, 106,
            s.includes(',') ? 'Use ponto como separador decimal.' : undefined);
        }
        return parseFloat(s);
      }
      case 'stringofchar': return String(A[0]).repeat(Math.max(0, A[1]));
      case 'formatfloat': {
        const fmt = String(A[0]);
        const m = fmt.match(/\.(0+|#+)/);
        const dec = m ? m[1].length : 0;
        let s = A[1].toFixed(dec);
        if (fmt.includes(',')) {
          const [ip, dp] = s.split('.');
          s = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dp ? '.' + dp : '');
        }
        return s;
      }
      case 'power': return Math.pow(A[0], A[1]);
      case 'max': return Math.max(A[0], A[1]);
      case 'min': return Math.min(A[0], A[1]);
      case 'keypressed': return false;
      case 'wherex': return 1;
      case 'wherey': return 1;
      default:
        throw this.rt(`Rotina '${name}' não implementada`, e);
    }
  }
}

export { CRT_COLORS };
