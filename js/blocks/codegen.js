// Gerador de código: árvore de blocos → código Pascal formatado + mapa linha→bloco.

const IND = '  ';

export function quotePascal(text) {
  return "'" + String(text).replace(/'/g, "''") + "'";
}

/** Converte o texto de um campo "texto" em literal Pascal, tratando quebras de linha. */
function textLiteral(text) {
  return quotePascal(text);
}

function clean(v, fallback = '') {
  const s = String(v ?? '').trim();
  return s || fallback;
}

function stripSemi(s) {
  return String(s || '').trim().replace(/;+\s*$/, '');
}

export function writeArgs(parts) {
  return (parts || [])
    .filter((p) => p && (p.k === 'text' || clean(p.v)))
    .map((p) => {
      if (p.k === 'text') return textLiteral(p.v ?? '');
      let s = clean(p.v);
      const fmt = clean(p.fmt).replace(/^:/, '');
      if (fmt) s += ':' + fmt.replace(/\s+/g, '');
      return s;
    });
}

// Blocos cujo final fica "aberto" e poderiam capturar um else (dangling else)
const OPEN_ENDED = new Set(['if', 'ifelse', 'for', 'while']);

class Gen {
  constructor() {
    this.lines = [];
    this.map = [];
    this.fnStack = [];
  }

  emit(indent, text, id) {
    this.lines.push(IND.repeat(indent) + text);
    this.map.push(id || null);
  }

  // adiciona sufixo à última linha emitida (para ';')
  suffix(s) {
    if (!s) return;
    this.lines[this.lines.length - 1] += s;
  }

  program(p) {
    const name = clean(p.f.name, 'MeuPrograma').replace(/\s+/g, '_');
    this.emit(0, `program ${name};`, p.id);
    if (p.f.crt) this.emit(0, 'uses crt;', p.id);
    if (p.s.decls.length) {
      this.emit(0, '', null);
      this.decls(p.s.decls, 0);
    }
    this.emit(0, '', null);
    this.emit(0, 'begin', p.id);
    this.stmtList(p.s.body, 1);
    this.emit(0, 'end.', p.id);
    return { code: this.lines.join('\n') + '\n', map: this.map };
  }

  decls(list, ind) {
    let prev = null;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      const sec = d.type === 'var' ? 'var' : d.type === 'const' ? 'const' : d.type === 'typedecl' ? 'type' : null;
      const kind = sec || d.type;
      const isRoutine = d.type === 'procedure' || d.type === 'function';
      if (i > 0 && (kind !== prev || isRoutine)) this.emit(ind, '', null);
      if (sec && sec !== prev) this.emit(ind, sec, d.id);
      prev = kind;
      switch (d.type) {
        case 'var':
          this.emit(ind + 1, `${clean(d.f.names, 'x').replace(/\s*,\s*/g, ', ')}: ${clean(d.f.type, 'integer')};`, d.id);
          break;
        case 'const':
          this.emit(ind + 1, `${clean(d.f.name, 'C')} = ${clean(d.f.value, '0')};`, d.id);
          break;
        case 'typedecl':
          this.typeDecl(d, ind + 1);
          break;
        case 'rawdecl':
          for (const l of String(d.f.code || '').split('\n')) this.emit(ind, l.replace(/\s+$/, ''), d.id);
          break;
        case 'procedure':
        case 'function':
          this.routine(d, ind);
          break;
        default:
          break;
      }
    }
  }

  typeDecl(d, ind) {
    const def = clean(d.f.def, 'integer');
    const name = clean(d.f.name, 'TTipo');
    // record em várias linhas para ficar legível
    const m = def.match(/^record\b([\s\S]*)\bend$/i);
    if (m) {
      this.emit(ind, `${name} = record`, d.id);
      const fields = m[1].split(';').map((s) => s.trim()).filter(Boolean);
      for (const f of fields) this.emit(ind + 1, f.replace(/\s*:\s*/, ': ') + ';', d.id);
      this.emit(ind, 'end;', d.id);
    } else {
      this.emit(ind, `${name} = ${def};`, d.id);
    }
  }

  routine(d, ind) {
    const name = clean(d.f.name, d.type === 'function' ? 'Funcao' : 'Procedimento');
    const params = clean(d.f.params);
    const head = `${d.type} ${name}${params ? `(${params})` : ''}${d.type === 'function' ? ': ' + clean(d.f.ret, 'integer') : ''};`;
    this.emit(ind, head, d.id);
    if (d.s.locals.length) this.decls(d.s.locals, ind);
    this.emit(ind, 'begin', d.id);
    this.fnStack.push(d.type === 'function' ? name : null);
    this.stmtList(d.s.body, ind + 1);
    this.fnStack.pop();
    this.emit(ind, 'end;', d.id);
  }

  stmtList(list, ind) {
    for (const b of list) this.stmt(b, ind, ';');
  }

  /** Quantos comandos Pascal o bloco gera (para decidir se precisa begin/end). */
  count(b) {
    if (b.type === 'ask') return 2;
    if (b.type === 'comment') return 0;
    if (b.type === 'raw') {
      const code = stripSemi(b.f.code);
      if (!code) return 0;
      return /;/.test(code) ? 2 : 1;
    }
    return 1;
  }

  /** Corpo de if/for/while: um comando sozinho ou begin..end */
  body(list, ind, term, id, forceBlock = false) {
    const real = list.filter((b) => b.type !== 'comment');
    if (!forceBlock && list.length === 1 && real.length === 1 && this.count(real[0]) === 1) {
      this.stmt(real[0], ind + 1, term);
      return;
    }
    this.emit(ind, 'begin', id);
    this.stmtList(list, ind + 1);
    this.emit(ind, 'end' + term, id);
  }

  stmt(b, ind, term) {
    const f = b.f;
    switch (b.type) {
      case 'writeln': {
        const args = writeArgs(f.parts);
        this.emit(ind, `${f.mode || 'writeln'}${args.length ? `(${args.join(', ')})` : ''}${term}`, b.id);
        break;
      }
      case 'readln': {
        const vars = clean(f.vars);
        this.emit(ind, `${f.mode || 'readln'}${vars ? `(${vars})` : ''}${term}`, b.id);
        break;
      }
      case 'ask':
        this.emit(ind, `write(${textLiteral(f.text ?? '')});`, b.id);
        this.emit(ind, `readln(${clean(f.var, 'x')})${term}`, b.id);
        break;
      case 'assign':
        this.emit(ind, `${clean(f.target, 'x')} := ${clean(f.value, '0')}${term}`, b.id);
        break;
      case 'inc': {
        const amt = clean(f.amount, '1');
        this.emit(ind, `${f.mode || 'inc'}(${clean(f.var, 'i')}${amt !== '1' ? ', ' + amt : ''})${term}`, b.id);
        break;
      }
      case 'if':
        this.emit(ind, `if ${clean(f.cond, 'true')} then`, b.id);
        this.body(b.s.then, ind, term, b.id);
        break;
      case 'ifelse':
        this.ifElse(b, ind, term, false);
        break;
      case 'case': {
        this.emit(ind, `case ${clean(f.expr, 'x')} of`, b.id);
        for (const it of b.s.items) {
          if (it.type !== 'caseitem') continue;
          const labels = clean(it.f.labels, '0');
          const real = it.s.body.filter((x) => x.type !== 'comment');
          if (it.s.body.length === 1 && real.length === 1 && this.count(real[0]) === 1) {
            const before = this.lines.length;
            this.stmt(real[0], ind + 1, ';');
            if (this.lines.length - before === 1) {
              // junta "rótulo:" com o comando na mesma linha
              this.lines[before] = IND.repeat(ind + 1) + `${labels}: ` + this.lines[before].trimStart();
              this.map[before] = real[0].id;
            } else {
              this.lines.length = before;
              this.map.length = before;
              this.emit(ind + 1, `${labels}:`, it.id);
              this.stmt(real[0], ind + 2, ';');
            }
          } else {
            this.emit(ind + 1, `${labels}:`, it.id);
            this.emit(ind + 2, 'begin', it.id);
            this.stmtList(it.s.body, ind + 3);
            this.emit(ind + 2, 'end;', it.id);
          }
        }
        if (b.s.else.length) {
          this.emit(ind, 'else', b.id);
          this.stmtList(b.s.else, ind + 1);
        }
        this.emit(ind, 'end' + term, b.id);
        break;
      }
      case 'for':
        this.emit(ind, `for ${clean(f.var, 'i')} := ${clean(f.from, '1')} ${f.dir === 'downto' ? 'downto' : 'to'} ${clean(f.to, '10')} do`, b.id);
        this.body(b.s.body, ind, term, b.id);
        break;
      case 'while':
        this.emit(ind, `while ${clean(f.cond, 'true')} do`, b.id);
        this.body(b.s.body, ind, term, b.id);
        break;
      case 'repeat':
        this.emit(ind, 'repeat', b.id);
        this.stmtList(b.s.body, ind + 1);
        this.emit(ind, `until ${clean(f.cond, 'true')}${term}`, b.id);
        break;
      case 'break':
      case 'continue':
      case 'exit':
      case 'clrscr':
      case 'readkey':
      case 'halt':
        this.emit(ind, b.type + term, b.id);
        break;
      case 'call': {
        const args = clean(f.args);
        this.emit(ind, `${clean(f.name, 'Procedimento')}${args ? `(${args})` : ''}${term}`, b.id);
        break;
      }
      case 'return': {
        const fn = this.fnStack.length ? this.fnStack[this.fnStack.length - 1] : null;
        this.emit(ind, `${fn || 'Result'} := ${clean(f.value, '0')}${term}`, b.id);
        break;
      }
      case 'textcolor':
        this.emit(ind, `${f.mode || 'textcolor'}(${f.color || 'White'})${term}`, b.id);
        break;
      case 'delay':
        this.emit(ind, `delay(${clean(f.ms, '500')})${term}`, b.id);
        break;
      case 'comment':
        this.emit(ind, `{ ${String(f.text || '').replace(/}/g, ')')} }`, b.id);
        break;
      case 'raw': {
        const code = stripSemi(f.code);
        if (!code) break;
        const ls = code.split('\n');
        ls.forEach((l, i) => this.emit(ind, l.replace(/\s+$/, '') + (i === ls.length - 1 ? term : ''), b.id));
        break;
      }
      default:
        break;
    }
  }

  ifElse(b, ind, term, isElseIf) {
    const f = b.f;
    const head = `if ${clean(f.cond, 'true')} then`;
    if (isElseIf) {
      this.lines[this.lines.length - 1] += ' ' + head;
      this.map[this.map.length - 1] = b.id;
    } else this.emit(ind, head, b.id);
    const thenList = b.s.then;
    const single = thenList.length === 1 ? thenList[0] : null;
    const force = single && OPEN_ENDED.has(single.type);
    this.body(thenList, ind, '', b.id, force);
    // else if encadeado
    const el = b.s.else;
    if (el.length === 1 && (el[0].type === 'ifelse' || el[0].type === 'if')) {
      this.emit(ind, 'else', b.id);
      const inner = el[0];
      if (inner.type === 'ifelse') this.ifElse(inner, ind, term, true);
      else {
        this.lines[this.lines.length - 1] += ` if ${clean(inner.f.cond, 'true')} then`;
        this.map[this.map.length - 1] = inner.id;
        this.body(inner.s.then, ind, term, inner.id);
      }
      return;
    }
    this.emit(ind, 'else', b.id);
    this.body(el, ind, term, b.id);
  }
}

/** Gera { code, map } onde map[linha-1] = id do bloco. */
export function generate(program) {
  return new Gen().program(program);
}
