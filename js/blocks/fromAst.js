// Converte código Pascal (AST) em blocos.
import { parseProgram } from '../pascal/parser.js';
import { createBlock, createProgram } from './model.js';
import { COLORS } from './defs.js';

export function codeToBlocks(src) {
  const ast = parseProgram(src); // lança PascalError em caso de erro de sintaxe
  return new Conv(src).program(ast);
}

class Conv {
  constructor(src) {
    this.src = src;
  }

  text(node) {
    if (!node) return '';
    return this.src.slice(node.pos, node.end).replace(/\s+/g, ' ').trim();
  }

  rawText(node) {
    // preserva quebras de linha para blocos de código livre
    const lines = this.src.slice(node.pos, node.end).split('\n');
    const indent = Math.min(...lines.slice(1).filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length), Infinity);
    return lines.map((l, i) => (i === 0 || !isFinite(indent) ? l : l.slice(indent))).join('\n').trim();
  }

  span(first, last) {
    return this.src.slice(first.pos, last.end).replace(/\s+/g, ' ').trim();
  }

  program(ast) {
    const p = createProgram(ast.nameRaw || 'MeuPrograma');
    p.f.crt = ast.uses.some((u) => u.toLowerCase() === 'crt');
    p.s.decls = this.decls(ast.block.decls);
    p.s.body = this.stmts(ast.block.body.body);
    return p;
  }

  decls(list) {
    const out = [];
    for (const d of list) {
      switch (d.kind) {
        case 'var':
          if (d.init) out.push(createBlock('rawdecl', { code: 'var ' + this.rawText(d) }));
          else out.push(createBlock('var', { names: d.raws.join(', '), type: this.text(d.typeNode) }));
          break;
        case 'const':
          if (d.typeNode) out.push(createBlock('rawdecl', { code: 'const ' + this.rawText(d) }));
          else out.push(createBlock('const', { name: d.nameRaw, value: this.text(d.value) }));
          break;
        case 'typedecl':
          out.push(createBlock('typedecl', { name: d.nameRaw, def: this.text(d.typeNode) }));
          break;
        case 'routine': {
          if (!d.block) {
            out.push(createBlock('rawdecl', { code: this.rawText(d) }));
            break;
          }
          const b = createBlock(d.isFunc ? 'function' : 'procedure', {
            name: d.nameRaw,
            params: d.params.length ? this.span(d.params[0], d.params[d.params.length - 1]) : '',
          });
          if (d.isFunc) b.f.ret = this.text(d.retType);
          const savedFn = this.fn;
          this.fn = d.isFunc ? d.name : null;
          b.s.locals = this.decls(d.block.decls);
          b.s.body = this.stmts(d.block.body.body);
          this.fn = savedFn;
          out.push(b);
          break;
        }
        default:
          break;
      }
    }
    return out;
  }

  /** Lista de comandos; begin..end soltos são achatados. */
  stmts(list) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s) continue;
      // write('texto'); readln(x);  →  bloco "perguntar"
      const next = list[i + 1];
      if (s.kind === 'call' && s.name === 'write' && s.args.length === 1 && s.args[0].kind === 'str' && !s.args[0].width &&
        next && next.kind === 'call' && next.name === 'readln' && next.args.length === 1) {
        out.push(createBlock('ask', { text: s.args[0].value, var: this.text(next.args[0]) }));
        i++;
        continue;
      }
      if (s.kind === 'compound') {
        out.push(...this.stmts(s.body));
        continue;
      }
      const b = this.stmt(s);
      if (b) out.push(b);
    }
    return out;
  }

  body(s) {
    if (!s) return [];
    if (s.kind === 'compound') return this.stmts(s.body);
    return this.stmts([s]);
  }

  raw(s) {
    return createBlock('raw', { code: this.rawText(s) });
  }

  stmt(s) {
    switch (s.kind) {
      case 'assign':
        if (s.op !== ':=') return this.raw(s);
        if (this.fn && s.target.kind === 'id' && (s.target.name === this.fn || s.target.name === 'result')) {
          return createBlock('return', { value: this.text(s.value) });
        }
        return createBlock('assign', { target: this.text(s.target), value: this.text(s.value) });
      case 'call':
        return this.call(s);
      case 'if': {
        if (!s.else) {
          const b = createBlock('if', { cond: this.text(s.cond) });
          b.s.then = this.body(s.then);
          return b;
        }
        const b = createBlock('ifelse', { cond: this.text(s.cond) });
        b.s.then = this.body(s.then);
        b.s.else = this.body(s.else);
        return b;
      }
      case 'while': {
        const b = createBlock('while', { cond: this.text(s.cond) });
        b.s.body = this.body(s.body);
        return b;
      }
      case 'repeat': {
        const b = createBlock('repeat', { cond: this.text(s.cond) });
        b.s.body = this.stmts(s.body);
        return b;
      }
      case 'for': {
        const b = createBlock('for', { var: s.varRaw, from: this.text(s.from), dir: s.down ? 'downto' : 'to', to: this.text(s.to) });
        b.s.body = this.body(s.body);
        return b;
      }
      case 'case': {
        const b = createBlock('case', { expr: this.text(s.expr) });
        for (const br of s.branches) {
          const first = br.labels[0].lo;
          const lastL = br.labels[br.labels.length - 1];
          const last = lastL.hi || lastL.lo;
          const it = createBlock('caseitem', { labels: this.span(first, last) });
          it.s.body = this.body(br.body);
          b.s.items.push(it);
        }
        if (s.else) b.s.else = this.stmts(s.else);
        return b;
      }
      case 'break':
      case 'continue':
        return createBlock(s.kind);
      case 'exit':
        if (s.value) return this.raw(s);
        return createBlock('exit');
      default:
        return this.raw(s);
    }
  }

  call(s) {
    const name = s.name;
    const args = s.args;
    const argText = args.length ? this.span(args[0], lastArgEnd(args)) : '';
    switch (name) {
      case 'writeln':
      case 'write': {
        const parts = args.map((a) => {
          if (a.kind === 'str' && !a.width) return { k: 'text', v: a.value };
          let fmt = '';
          if (a.width) fmt = this.text(a.width) + (a.prec ? ':' + this.text(a.prec) : '');
          return { k: 'expr', v: this.text(a), fmt };
        });
        return createBlock('writeln', { mode: name, parts });
      }
      case 'readln':
      case 'read':
        return createBlock('readln', { mode: name, vars: args.map((a) => this.text(a)).join(', ') });
      case 'inc':
      case 'dec':
        if (args.length >= 1) {
          return createBlock('inc', { mode: name, var: this.text(args[0]), amount: args[1] ? this.text(args[1]) : '1' });
        }
        break;
      case 'clrscr':
      case 'readkey':
      case 'halt':
        if (!args.length) return createBlock(name);
        break;
      case 'delay':
        if (args.length === 1) return createBlock('delay', { ms: this.text(args[0]) });
        break;
      case 'textcolor':
      case 'textbackground':
        if (args.length === 1) {
          const t = this.text(args[0]).toLowerCase();
          const idx = /^\d+$/.test(t) ? parseInt(t, 10) : COLORS.findIndex((c) => c.toLowerCase() === t);
          if (idx >= 0 && idx < 16) return createBlock('textcolor', { mode: name, color: COLORS[idx] });
        }
        break;
      default:
        break;
    }
    return createBlock('call', { name: s.nameRaw || name, args: argText });
  }
}

function lastArgEnd(args) {
  const a = args[args.length - 1];
  if (a.prec) return a.prec;
  if (a.width) return a.width;
  return a;
}
