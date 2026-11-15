// Analisador sintático (parser) descendente recursivo para Pascal.
// Gera uma AST com posição (linha / offsets) em cada nó.
import { tokenize } from './lexer.js';
import { PascalError } from './errors.js';

const TOKEN_NAMES = { eof: 'fim do código' };

function describe(tok) {
  if (!tok) return '?';
  if (tok.t === 'eof') return TOKEN_NAMES.eof;
  if (tok.t === 'str') return `'${tok.v}'`;
  if (tok.t === 'id') return `'${tok.raw}'`;
  return `'${tok.v}'`;
}

const REL_OPS = new Set(['=', '<>', '<', '>', '<=', '>=', 'in']);
const ADD_OPS = new Set(['+', '-', 'or', 'xor']);
const MUL_OPS = new Set(['*', '/', 'div', 'mod', 'and', 'shl', 'shr']);

export class Parser {
  constructor(src) {
    this.src = src;
    this.toks = tokenize(src);
    this.p = 0;
  }

  get tok() {
    return this.toks[this.p];
  }
  peek(k = 1) {
    return this.toks[Math.min(this.p + k, this.toks.length - 1)];
  }
  prev() {
    return this.toks[Math.max(0, this.p - 1)];
  }
  next() {
    const t = this.toks[this.p];
    if (this.p < this.toks.length - 1) this.p++;
    return t;
  }
  is(t, v) {
    const k = this.tok;
    return k.t === t && (v === undefined || k.v === v);
  }
  isOp(v) {
    return this.is('op', v);
  }
  isKw(v) {
    return this.is('kw', v);
  }
  accept(t, v) {
    if (this.is(t, v)) return this.next();
    return null;
  }

  error(msg, tok = this.tok, hint) {
    throw new PascalError(msg, tok.line, tok.col, hint);
  }

  // Erro "faltando algo" aponta para o fim do token anterior (é onde o aluno esqueceu).
  errorMissing(what, hint) {
    const prev = this.prev();
    const found = this.tok;
    const usePrev = prev && prev !== found && prev.line < found.line;
    const at = usePrev ? prev : found;
    const col = usePrev ? at.col + (at.end - at.pos) : at.col;
    throw new PascalError(`Esperado ${what}, mas foi encontrado ${describe(found)}`, at.line, col, hint);
  }

  expectOp(v, hint) {
    if (this.isOp(v)) return this.next();
    if (v === ';' && !hint) hint = 'Provavelmente falta um ponto e vírgula (;) no fim desta linha.';
    if (v === ')' && !hint) hint = 'Verifique se todos os parênteses abertos foram fechados.';
    this.errorMissing(`'${v}'`, hint);
  }
  expectKw(v, hint) {
    if (this.isKw(v)) return this.next();
    this.errorMissing(`'${v}'`, hint);
  }
  expectId(what = 'um identificador') {
    if (this.is('id')) return this.next();
    if (this.tok.t === 'kw') {
      this.error(`'${this.tok.v}' é uma palavra reservada e não pode ser usada como nome`, this.tok,
        'Escolha outro nome (por exemplo, acrescente um número ou outra palavra).');
    }
    this.errorMissing(what);
  }

  node(kind, startTok, props) {
    const endTok = this.prev();
    return Object.assign({ kind, line: startTok.line, col: startTok.col, pos: startTok.pos, end: endTok.end }, props);
  }

  // ---------------------------------------------------------------- Programa
  parseProgram() {
    const start = this.tok;
    let name = '';
    let nameRaw = '';
    const uses = [];
    if (this.accept('kw', 'program')) {
      const id = this.expectId('o nome do programa');
      name = id.v;
      nameRaw = id.raw;
      if (this.accept('op', '(')) {
        // program Nome(input, output);
        while (!this.isOp(')') && !this.is('eof')) this.next();
        this.expectOp(')');
      }
      this.expectOp(';');
    }
    if (this.accept('kw', 'uses')) {
      do {
        const u = this.expectId('o nome de uma unit');
        uses.push(u.raw);
      } while (this.accept('op', ','));
      this.expectOp(';');
    }
    const block = this.parseBlock(true);
    if (!this.isOp('.')) {
      if (this.isOp(';')) {
        this.error("O programa principal termina com 'end.' (ponto final), não 'end;'", this.tok,
          "Troque o último 'end;' por 'end.'.");
      }
      this.errorMissing("'.' após o 'end' final", "O programa principal termina com 'end.'.");
    }
    this.next();
    return this.node('program', start, { name, nameRaw, uses, block });
  }

  parseBlock(isMain = false) {
    const decls = [];
    for (;;) {
      if (this.isKw('const')) this.parseConstSection(decls);
      else if (this.isKw('type')) this.parseTypeSection(decls);
      else if (this.isKw('var')) this.parseVarSection(decls);
      else if (this.isKw('procedure') || this.isKw('function')) decls.push(this.parseRoutine());
      else if (this.isKw('label')) this.error('label/goto não são suportados');
      else break;
    }
    if (!this.isKw('begin')) {
      if (this.is('id') && (this.peek().t === 'op' && (this.peek().v === ':' || this.peek().v === ','))) {
        this.error("Declaração de variável fora da seção 'var'", this.tok,
          "Coloque a palavra 'var' antes das declarações de variáveis.");
      }
      this.errorMissing("'begin'", isMain ? "O corpo do programa começa com 'begin' e termina com 'end.'." : undefined);
    }
    const body = this.parseCompound();
    return { decls, body };
  }

  parseConstSection(decls) {
    this.next();
    do {
      const start = this.tok;
      const id = this.expectId('o nome da constante');
      let typeNode = null;
      if (this.accept('op', ':')) typeNode = this.parseType();
      if (!this.isOp('=')) {
        if (this.isOp(':=')) this.error("Constantes usam '=' (e não ':=')", this.tok, `Exemplo: const ${id.raw} = 10;`);
        this.errorMissing("'='");
      }
      this.next();
      const value = this.parseConstValue();
      this.expectOp(';');
      decls.push(this.node('const', start, { name: id.v, nameRaw: id.raw, typeNode, value }));
    } while (this.is('id'));
  }

  // Valor de constante tipada pode ser (1,2,3) para arrays
  parseConstValue() {
    if (this.isOp('(')) {
      // Tenta interpretar como lista de valores (array constante)
      const save = this.p;
      const start = this.tok;
      this.next();
      const items = [this.parseConstValue()];
      if (this.isOp(',')) {
        while (this.accept('op', ',')) items.push(this.parseConstValue());
        this.expectOp(')');
        return this.node('arraylit', start, { items });
      }
      this.p = save;
    }
    return this.parseExpr();
  }

  parseTypeSection(decls) {
    this.next();
    do {
      const start = this.tok;
      const id = this.expectId('o nome do tipo');
      this.expectOp('=');
      const typeNode = this.parseType();
      this.expectOp(';');
      decls.push(this.node('typedecl', start, { name: id.v, nameRaw: id.raw, typeNode }));
    } while (this.is('id'));
  }

  parseVarSection(decls) {
    this.next();
    if (!this.is('id')) {
      if (this.isKw('begin')) this.error("Seção 'var' vazia", this.tok, "Declare pelo menos uma variável, ex: x: integer; — ou remova o 'var'.");
      this.expectId('o nome de uma variável');
    }
    do {
      const start = this.tok;
      const names = [];
      const raws = [];
      do {
        const id = this.expectId('o nome de uma variável');
        names.push(id.v);
        raws.push(id.raw);
      } while (this.accept('op', ','));
      if (!this.isOp(':')) {
        if (this.is('id')) this.errorMissing("',' ou ':'", 'Separe nomes de variáveis com vírgula e use : antes do tipo. Ex: a, b: integer;');
        this.errorMissing("':' seguido do tipo", 'Ex: idade: integer;');
      }
      this.next();
      const typeNode = this.parseType();
      let init = null;
      if (this.accept('op', '=')) init = this.parseConstValue();
      this.expectOp(';');
      decls.push(this.node('var', start, { names, raws, typeNode, init }));
    } while (this.is('id'));
  }

  parseType() {
    const start = this.tok;
    if (this.accept('kw', 'packed')) return this.parseType();
    if (this.accept('kw', 'array')) {
      const ranges = [];
      if (this.accept('op', '[')) {
        do {
          const lo = this.parseExpr();
          if (this.accept('op', '..')) {
            const hi = this.parseExpr();
            ranges.push({ lo, hi });
          } else {
            ranges.push({ typeName: lo }); // array[boolean] / array[char] / tipo enum
          }
        } while (this.accept('op', ','));
        this.expectOp(']', "Feche os colchetes. Ex: array[1..10] of integer");
      }
      this.expectKw('of', "Ex: array[1..10] of integer");
      const elem = this.parseType();
      return this.node('tarray', start, { ranges, elem, dynamic: ranges.length === 0 });
    }
    if (this.accept('kw', 'record')) {
      const fields = [];
      while (!this.isKw('end')) {
        const names = [];
        do names.push(this.expectId('o nome de um campo').v); while (this.accept('op', ','));
        this.expectOp(':');
        const typeNode = this.parseType();
        fields.push({ names, typeNode });
        if (!this.accept('op', ';')) break;
      }
      this.expectKw('end', "Um 'record' termina com 'end'.");
      return this.node('trecord', start, { fields });
    }
    if (this.accept('kw', 'set')) {
      this.expectKw('of');
      const elem = this.parseType();
      return this.node('tset', start, { elem });
    }
    if (this.isKw('file')) this.error('Arquivos (file) não são suportados neste ambiente');
    if (this.isOp('(')) {
      this.next();
      const names = [];
      do names.push(this.expectId('o nome de um valor').v); while (this.accept('op', ','));
      this.expectOp(')');
      return this.node('tenum', start, { names });
    }
    if (this.is('id')) {
      const id = this.tok;
      // subrange com constante: A..B
      if (this.peek().t === 'op' && this.peek().v === '..') {
        const lo = this.parseExpr();
        this.expectOp('..');
        const hi = this.parseExpr();
        return this.node('tsubrange', start, { lo, hi });
      }
      this.next();
      if (id.v === 'string' && this.accept('op', '[')) {
        const size = this.parseExpr();
        this.expectOp(']');
        return this.node('tname', start, { name: 'string', size });
      }
      return this.node('tname', start, { name: id.v, raw: id.raw });
    }
    if (this.is('int') || this.is('str') || this.isOp('-')) {
      const lo = this.parseExpr();
      this.expectOp('..', "Faixas de valores usam '..', ex: 1..10");
      const hi = this.parseExpr();
      return this.node('tsubrange', start, { lo, hi });
    }
    this.errorMissing('um tipo (integer, real, string, char, boolean...)');
  }

  parseRoutine() {
    const start = this.tok;
    const isFunc = this.next().v === 'function';
    const id = this.expectId(isFunc ? 'o nome da função' : 'o nome do procedimento');
    const params = [];
    if (this.accept('op', '(')) {
      if (!this.isOp(')')) {
        do {
          const pstart = this.tok;
          let mode = 'value';
          if (this.accept('kw', 'var')) mode = 'var';
          else if (this.accept('kw', 'const')) mode = 'const';
          else if (this.is('id') && this.tok.v === 'out') {
            this.next();
            mode = 'var';
          }
          const names = [];
          do names.push(this.expectId('o nome de um parâmetro').v); while (this.accept('op', ','));
          this.expectOp(':', 'Cada parâmetro precisa de um tipo. Ex: (a, b: integer)');
          const typeNode = this.parseType();
          let def = null;
          if (this.accept('op', '=')) def = this.parseExpr();
          params.push(this.node('param', pstart, { names, mode, typeNode, def }));
        } while (this.accept('op', ';'));
      }
      this.expectOp(')');
    }
    let retType = null;
    if (isFunc) {
      if (!this.isOp(':')) this.errorMissing("':' e o tipo de retorno da função", `Ex: function ${id.raw}(...): integer;`);
      this.next();
      retType = this.parseType();
    }
    this.expectOp(';');
    if (this.isKw('forward')) {
      this.next();
      this.expectOp(';');
      return this.node('routine', start, { isFunc, name: id.v, nameRaw: id.raw, params, retType, block: null, forward: true });
    }
    const block = this.parseBlock();
    this.expectOp(';', `Após o 'end' de ${isFunc ? 'uma função' : 'um procedimento'} use 'end;'.`);
    return this.node('routine', start, { isFunc, name: id.v, nameRaw: id.raw, params, retType, block });
  }

  // ---------------------------------------------------------------- Comandos
  parseCompound() {
    const start = this.expectKw('begin');
    const body = this.parseStatementList(['end']);
    if (!this.isKw('end')) {
      if (this.is('eof')) this.error("Fim do código sem o 'end' correspondente ao 'begin' da linha " + start.line, this.tok,
        "Todo 'begin' precisa de um 'end'.");
      this.errorMissing("';' ou 'end'");
    }
    this.next();
    return this.node('compound', start, { body });
  }

  parseStatementList(terminators) {
    const list = [];
    for (;;) {
      if (terminators.some((t) => this.isKw(t))) break;
      const st = this.parseStatement();
      if (st) list.push(st);
      if (this.accept('op', ';')) {
        if (this.isKw('else')) {
          this.error("Não pode haver ';' imediatamente antes de 'else'", this.prev(),
            "Em Pascal o comando antes do 'else' termina sem ponto e vírgula. Ex: 'end' em vez de 'end;'.");
        }
        continue;
      }
      if (terminators.some((t) => this.isKw(t))) break;
      if (this.is('eof')) break;
      if (this.isKw('end') && terminators.includes('until')) {
        this.error("'end' inesperado: o 'repeat' termina com 'until condição;'", this.tok,
          "Troque este 'end' por 'until' seguido da condição de parada. Ex: until x = 0;");
      }
      if (this.isKw('until') && !terminators.includes('until')) {
        this.error("'until' sem um 'repeat' correspondente", this.tok);
      }
      if (this.isKw('else')) {
        this.error("'else' sem um 'if' correspondente", this.tok,
          "Verifique se o 'else' está logo depois do comando do 'if' (sem ';' antes).");
      }
      this.errorMissing("';'", 'Separe os comandos com ponto e vírgula (;).');
    }
    return list;
  }

  parseStatement() {
    const t = this.tok;
    if (t.t === 'kw') {
      switch (t.v) {
        case 'begin': return this.parseCompound();
        case 'if': return this.parseIf();
        case 'while': return this.parseWhile();
        case 'repeat': return this.parseRepeat();
        case 'for': return this.parseFor();
        case 'case': return this.parseCase();
        case 'with': this.error("O comando 'with' não é suportado; acesse os campos diretamente (ex: aluno.nome)");
        // eslint-disable-next-line no-fallthrough
        case 'goto': this.error("O comando 'goto' não é suportado");
        // eslint-disable-next-line no-fallthrough
        case 'end': case 'until': return null;
        case 'var':
          this.error("Declarações 'var' devem ficar antes do 'begin'", t,
            "Mova as declarações de variáveis para a seção var, antes do bloco begin..end.");
        // eslint-disable-next-line no-fallthrough
        case 'then':
          this.error("'then' inesperado", t, "O 'then' vem logo após a condição do 'if'.");
        // eslint-disable-next-line no-fallthrough
        case 'else':
          return null;
        default:
          this.error(`Comando inesperado: '${t.v}'`);
      }
    }
    if (t.t === 'id') return this.parseSimpleStatement();
    if (t.t === 'op' && t.v === ';') return null; // comando vazio
    if (t.t === 'eof') return null;
    this.error(`Comando inválido começando com ${describe(t)}`, t,
      t.t === 'str' ? "Para mostrar um texto use writeln('texto');" : undefined);
  }

  parseSimpleStatement() {
    const start = this.tok;
    const name = this.tok.v;
    if (name === 'break' && !this.isLvalueCont()) {
      this.next();
      return this.node('break', start, {});
    }
    if (name === 'continue' && !this.isLvalueCont()) {
      this.next();
      return this.node('continue', start, {});
    }
    if (name === 'exit') {
      this.next();
      let value = null;
      if (this.accept('op', '(')) {
        if (!this.isOp(')')) value = this.parseExpr();
        this.expectOp(')');
      }
      return this.node('exit', start, { value });
    }
    const target = this.parseDesignator();
    if (this.isOp(':=') || this.isOp('+=') || this.isOp('-=') || this.isOp('*=') || this.isOp('/=')) {
      const op = this.next().v;
      if (this.isOp(';') || this.isKw('end') || this.is('eof')) {
        this.errorMissing('um valor após ' + op);
      }
      const value = this.parseExpr();
      return this.node('assign', start, { target, op, value });
    }
    if (this.isOp('=')) {
      this.error("Para atribuir um valor use ':=' (o '=' é comparação)", this.tok, `Ex: ${start.raw} := 10;`);
    }
    if (target.kind === 'id') return this.node('call', start, { name: target.name, nameRaw: start.raw, args: [] });
    if (target.kind === 'call') return this.node('call', start, { name: target.name, nameRaw: target.nameRaw, args: target.args });
    this.errorMissing("':='");
  }

  isLvalueCont() {
    const n = this.peek();
    return n.t === 'op' && (n.v === ':=' || n.v === '[' || n.v === '.');
  }

  parseIf() {
    const start = this.next();
    const cond = this.parseExpr();
    if (!this.isKw('then')) {
      if (this.isKw('do')) this.error("Use 'then' após a condição do 'if' (o 'do' é para while/for)", this.tok);
      this.errorMissing("'then'", "A estrutura é: if condição then comando");
    }
    this.next();
    const thenS = this.isKw('else') ? null : this.parseStatement();
    let elseS = null;
    if (this.accept('kw', 'else')) elseS = this.parseStatement();
    return this.node('if', start, { cond, then: thenS, else: elseS });
  }

  parseWhile() {
    const start = this.next();
    const cond = this.parseExpr();
    if (!this.isKw('do')) this.errorMissing("'do'", 'A estrutura é: while condição do comando');
    this.next();
    const body = this.parseStatement();
    return this.node('while', start, { cond, body });
  }

  parseRepeat() {
    const start = this.next();
    const body = this.parseStatementList(['until']);
    if (!this.isKw('until')) this.errorMissing("'until'", "Todo 'repeat' termina com 'until condição;'.");
    this.next();
    const cond = this.parseExpr();
    return this.node('repeat', start, { body, cond });
  }

  parseFor() {
    const start = this.next();
    const v = this.expectId('a variável de controle do for');
    if (!this.isOp(':=')) this.errorMissing("':='", 'Ex: for i := 1 to 10 do');
    this.next();
    const from = this.parseExpr();
    let down = false;
    if (this.accept('kw', 'downto')) down = true;
    else if (!this.accept('kw', 'to')) this.errorMissing("'to' ou 'downto'", 'Ex: for i := 1 to 10 do');
    const to = this.parseExpr();
    if (!this.isKw('do')) this.errorMissing("'do'", 'Ex: for i := 1 to 10 do');
    this.next();
    const body = this.parseStatement();
    return this.node('for', start, { varName: v.v, varRaw: v.raw, varLine: v.line, from, to, down, body });
  }

  parseCase() {
    const start = this.next();
    const expr = this.parseExpr();
    this.expectKw('of', 'A estrutura é: case variavel of');
    const branches = [];
    let elseBody = null;
    while (!this.isKw('end')) {
      if (this.isKw('else') || (this.is('id') && this.tok.v === 'otherwise')) {
        this.next();
        elseBody = this.parseStatementList(['end']);
        break;
      }
      const bstart = this.tok;
      const labels = [];
      do {
        const lo = this.parseExpr();
        if (this.accept('op', '..')) labels.push({ lo, hi: this.parseExpr() });
        else labels.push({ lo, hi: null });
      } while (this.accept('op', ','));
      this.expectOp(':', 'Cada opção do case é: valor: comando;');
      const body = this.isOp(';') ? null : this.parseStatement();
      branches.push(this.node('casebranch', bstart, { labels, body }));
      if (!this.accept('op', ';')) {
        if (this.isKw('end') || this.isKw('else')) continue;
        this.errorMissing("';'");
      }
    }
    this.expectKw('end', "O 'case' termina com 'end;'.");
    return this.node('case', start, { expr, branches, else: elseBody });
  }

  // designator: id ( '[' exprs ']' | '.' id | '(' args ')' | '^' )*
  parseDesignator() {
    const start = this.tok;
    const id = this.expectId();
    let node = { kind: 'id', name: id.v, raw: id.raw, line: id.line, col: id.col, pos: id.pos, end: id.end };
    for (;;) {
      if (this.isOp('[')) {
        this.next();
        const indices = [this.parseExpr()];
        while (this.accept('op', ',')) indices.push(this.parseExpr());
        this.expectOp(']');
        node = this.node('index', start, { target: node, indices });
      } else if (this.isOp('.') && this.peek().t === 'id') {
        this.next();
        const f = this.next();
        node = this.node('field', start, { target: node, name: f.v, raw: f.raw });
      } else if (this.isOp('(') && node.kind === 'id') {
        this.next();
        const args = this.parseArgs();
        node = this.node('call', start, { name: node.name, nameRaw: node.raw, args });
      } else if (this.isOp('^')) {
        this.error('Ponteiros não são suportados neste ambiente');
      } else break;
    }
    return node;
  }

  parseArgs() {
    const args = [];
    if (!this.isOp(')')) {
      do {
        const e = this.parseExpr();
        if (this.isOp(':')) {
          this.next();
          e.width = this.parseExpr();
          if (this.accept('op', ':')) e.prec = this.parseExpr();
        }
        args.push(e);
      } while (this.accept('op', ','));
    }
    this.expectOp(')', 'Verifique se todos os parênteses abertos foram fechados.');
    return args;
  }

  // ---------------------------------------------------------------- Expressões
  parseExpr() {
    const start = this.tok;
    let left = this.parseSimple();
    while (this.tok.t !== 'eof' && REL_OPS.has(this.tok.v) && (this.tok.t === 'op' || this.tok.v === 'in')) {
      const opTok = this.next();
      const right = this.parseSimple();
      left = this.node('bin', start, { op: opTok.v, left, right, opLine: opTok.line, opCol: opTok.col });
      if (this.tok.t === 'op' && REL_OPS.has(this.tok.v)) {
        if (right.kind === 'bin' && ['and', 'or', 'xor'].includes(right.op) && !right.paren) {
          this.error(`Use parênteses em cada comparação ao combinar com '${right.op}'`, { line: right.opLine, col: right.opCol },
            `Em Pascal, '${right.op}' é avaliado antes de < > =. Escreva assim: (a > 0) ${right.op} (a < 10)`);
        }
        this.error('Comparações encadeadas não são permitidas', this.tok,
          'Em Pascal não dá para escrever a < b < c. Use (a < b) and (b < c).');
      }
    }
    return left;
  }

  parseSimple() {
    const start = this.tok;
    let left;
    if (this.isOp('-') || this.isOp('+')) {
      const op = this.next().v;
      left = this.node('un', start, { op, expr: this.parseTerm() });
    } else left = this.parseTerm();
    while ((this.tok.t === 'op' || this.tok.t === 'kw') && ADD_OPS.has(this.tok.v)) {
      const opTok = this.next();
      const right = this.parseTerm();
      left = this.node('bin', start, { op: opTok.v, left, right, opLine: opTok.line, opCol: opTok.col });
    }
    return left;
  }

  parseTerm() {
    const start = this.tok;
    let left = this.parseFactor();
    while ((this.tok.t === 'op' || this.tok.t === 'kw') && MUL_OPS.has(this.tok.v)) {
      const opTok = this.next();
      const right = this.parseFactor();
      left = this.node('bin', start, { op: opTok.v, left, right, opLine: opTok.line, opCol: opTok.col });
    }
    return left;
  }

  parseFactor() {
    const t = this.tok;
    if (t.t === 'int' || t.t === 'real') {
      this.next();
      return this.node('num', t, { value: t.v, isReal: t.t === 'real' });
    }
    if (t.t === 'str') {
      this.next();
      return this.node('str', t, { value: t.v });
    }
    if (t.t === 'kw' && t.v === 'not') {
      this.next();
      return this.node('un', t, { op: 'not', expr: this.parseFactor() });
    }
    if (t.t === 'kw' && t.v === 'nil') {
      this.error('Ponteiros (nil) não são suportados');
    }
    if (t.t === 'op' && (t.v === '-' || t.v === '+')) {
      this.next();
      return this.node('un', t, { op: t.v, expr: this.parseFactor() });
    }
    if (t.t === 'op' && t.v === '(') {
      this.next();
      const e = this.parseExpr();
      this.expectOp(')');
      e.paren = true;
      return e;
    }
    if (t.t === 'op' && t.v === '[') {
      this.next();
      const elems = [];
      if (!this.isOp(']')) {
        do {
          const lo = this.parseExpr();
          if (this.accept('op', '..')) elems.push({ lo, hi: this.parseExpr() });
          else elems.push({ lo, hi: null });
        } while (this.accept('op', ','));
      }
      this.expectOp(']');
      return this.node('set', t, { elems });
    }
    if (t.t === 'id') return this.parseDesignator();
    if (t.t === 'eof') this.errorMissing('um valor ou expressão');
    if (t.t === 'op' && t.v === ')') this.error("')' sem '(' correspondente, ou valor faltando antes de ')'");
    if (t.t === 'kw') this.error(`'${t.v}' inesperado — esperado um valor ou expressão`, t,
      (t.v === 'and' || t.v === 'or') ? 'Falta um valor antes do operador.' : undefined);
    this.error(`Esperado um valor ou expressão, mas foi encontrado ${describe(t)}`);
  }
}

export function parseProgram(src) {
  return new Parser(src).parseProgram();
}

/** Analisa apenas uma expressão (usado para validar campos dos blocos). */
export function parseExpression(src) {
  const p = new Parser(src);
  const e = p.parseExpr();
  if (!p.is('eof')) p.error(`Sobrou ${describe(p.tok)} no fim da expressão`);
  return e;
}
