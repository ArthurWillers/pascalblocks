// Testes do motor Pascal: node tests/run.mjs
import { compile, Interpreter } from '../js/pascal/index.js';
import { EXAMPLES } from '../js/examples.js';

let pass = 0;
let fail = 0;

async function runProgram(src, inputs = []) {
  const res = compile(src);
  if (!res.ok) return { compileErrors: res.errors, warnings: res.warnings };
  let out = '';
  const queue = [...inputs];
  const io = {
    write: (t) => (out += t),
    clear: () => {},
    readLine: async () => {
      if (!queue.length) throw new Error('sem entrada');
      const l = queue.shift();
      out += l + '\n';
      return l;
    },
    readKey: async () => 'x',
  };
  const it = new Interpreter(res.ast, io);
  try {
    await it.run();
  } catch (e) {
    return { out, runtime: e, warnings: res.warnings };
  }
  return { out, warnings: res.warnings };
}

function check(name, cond, info) {
  if (cond) pass++;
  else {
    fail++;
    console.log('FALHOU:', name, info !== undefined ? '\n' + info : '');
  }
}

for (const ex of EXAMPLES) {
  const r = await runProgram(ex.code, ex.input || ['50', '25', '75', '12', '88', '37', '63', '44', '56', '50']);
  if (r.compileErrors) {
    check(ex.id, false, r.compileErrors.map((e) => `${e.line}:${e.col} ${e.message}`).join('\n'));
    continue;
  }
  if (r.runtime && !(ex.id === 'adivinha' && /sem entrada/.test(r.runtime.message))) {
    check(ex.id, false, 'runtime: ' + r.runtime.message + ' line ' + r.runtime.line);
    continue;
  }
  if (ex.expect !== undefined) check(ex.id, r.out === ex.expect, JSON.stringify(r.out) + '\n' + JSON.stringify(ex.expect));
  else check(ex.id, true);
  if (r.warnings.length) console.log('  avisos em', ex.id, r.warnings.map((w) => w.message));
}

// ---- casos de saída
const outCases = [
  ["begin writeln(3.5); end.", ' 3.5000000000000000E+000\n'],
  ["begin writeln(-0.001); end.", '-1.0000000000000000E-003\n'],
  ["begin writeln(10/4:6:2, '|'); end.", '  2.50|\n'],
  ["begin writeln(true, ' ', 1 < 2); end.", 'TRUE TRUE\n'],
  ["begin writeln(7 div 2, ' ', -7 div 2, ' ', 7 mod 3, ' ', -7 mod 3); end.", '3 -3 1 -1\n'],
  ["begin writeln(round(2.5), round(3.5), round(-2.5), trunc(-2.7)); end.", '24-2-2\n'],
  ["var s: string; begin s := 'abc'; s[2] := 'X'; writeln(s, length(s)); end.", 'aXc3\n'],
  ["var s: string; begin s := 'Hello World'; delete(s, 1, 6); insert('!', s, 6); writeln(s, pos('o', s)); end.", 'World!2\n'],
  ["var c: char; begin for c := 'a' to 'e' do write(c); writeln; end.", 'abcde\n'],
  ["var i: integer; begin for i := 5 downto 1 do begin if i = 2 then break; if i = 4 then continue; write(i); end; writeln; end.", '53\n'],
  ["var a: array of integer; i: integer; begin setlength(a, 3); for i := 0 to high(a) do a[i] := i * i; writeln(a[2], length(a)); end.", '43\n'],
  ["type Cor = (vermelho, verde, azul); var c: Cor; begin c := verde; writeln(c, ord(c)); c := succ(c); writeln(c); end.", 'verde1\nazul\n'],
  ["var x: integer; s: string; code: integer; begin val('123', x, code); str(x * 2, s); writeln(s, ' ', code); end.", '246 0\n'],
  ["begin writeln(IntToStr(42) + '!', copy('Pascal', 2, 3), UpperCase('abc')); end.", '42!ascABC\n'],
  ["function f(x: integer): integer; begin Result := x * 2; end; begin writeln(f(21)); end.", '42\n'],
  ["procedure p(n: integer); begin if n > 0 then begin write(n); p(n - 1); end; end; begin p(3); writeln; end.", '321\n'],
  ["var i, s: integer; begin s := 0; i := 0; repeat inc(i); s += i; until i = 10; writeln(s); end.", '55\n'],
  ["var m: array[1..2, 1..2] of real; begin m[1][2] := 1.5; writeln(m[1, 2]:0:1); end.", '1.5\n'],
  ["const v: array[1..3] of integer = (10, 20, 30); begin writeln(v[2]); end.", '20\n'],
  ["var x: real; begin x := 5; writeln(x:0:0, ' ', sqrt(16):0:0, ' ', abs(-3), ' ', sqr(1.5):0:2); end.", '5 4 3 2.25\n'],
  ["var s: string; begin case 'b' of 'a': s := 'A'; 'b', 'c': s := 'BC'; else s := '?'; end; writeln(s); end.", 'BC\n'],
  ["var n: integer; begin n := 15; case n of 1..9: writeln('um digito'); 10..99: writeln('dois'); end; end.", 'dois\n'],
  ["procedure outer; var x: integer; procedure inner; begin x := x + 1; end; begin x := 1; inner; inner; writeln(x); end; begin outer; end.", '3\n'],
  ["begin writeln('It''s ok', #33); end.", "It's ok!\n"],
  ["begin writeln(5:4, 'x':3, 'abc':5); end.", '   5  x  abc\n'],
];
for (const [src, exp] of outCases) {
  const r = await runProgram(src);
  if (r.compileErrors) check(src, false, r.compileErrors.map((e) => `${e.line}:${e.col} ${e.message}`).join('\n'));
  else if (r.runtime) check(src, false, 'runtime: ' + r.runtime.message);
  else check(src, r.out === exp, JSON.stringify(r.out) + ' esperado ' + JSON.stringify(exp));
}

// ---- entrada
const inCases = [
  ['var a, b: integer; begin readln(a, b); writeln(a + b); end.', ['3 4'], '3 4\n7\n'],
  ['var a, b: integer; begin read(a); read(b); writeln(a * b); end.', ['6', '7'], '6\n7\n42\n'],
  ['var s: string; n: integer; begin readln(n); readln(s); writeln(s, n); end.', ['5', 'oi'], '5\noi\noi5\n'],
];
for (const [src, inp, exp] of inCases) {
  const r = await runProgram(src, inp);
  if (r.compileErrors) check(src, false, r.compileErrors.map((e) => e.message).join('\n'));
  else check(src, r.out === exp, JSON.stringify(r.out));
}

// ---- erros de compilação esperados (substring da mensagem)
const errCases = [
  ['begin x := 1; end.', 'não declarado'],
  ['var x: integer; begin x := 1.5; end.', 'Tipos incompatíveis'],
  ['var x: integer; begin x := 10 / 2; end.', 'Tipos incompatíveis'],
  ['var x: integer; begin if x = 1 then writeln(1); else writeln(2); end.', "';'"],
  ['var x: integer begin end.', "';'"],
  ['begin writeln("oi"); end.', 'apóstrofos'],
  ['var x: integer; begin if x then writeln; end.', 'boolean'],
  ['var x, y: integer; begin if x > 0 and y > 0 then writeln; end.', 'parênteses'],
  ['begin if 1 < 2 < 3 then writeln; end.', 'encadeadas'],
  ['begin repeat writeln(1); end.', 'until'],
  ['var x: integer; begin x = 5; end.', ':='],
  ['var s: string; begin s := 5; end.', 'Tipos incompatíveis'],
  ['var x: integer; begin writeln(x) end', "'.'"],
  ['var i: integer; begin for i := 1 to 3 do i := 2; end.', 'controle'],
  ['begin writeln(1 div 2.0); end.', 'inteiros'],
  ['var cont: integer; begin cnt := 1; end.', "quis dizer 'cont'"],
  ['begin break; end.', 'laço'],
  ['procedure p(var a: integer); begin end; begin p(3); end.', 'variável'],
  ['var v: array[1..3] of integer; begin v(1) := 2; end.', 'variável'],
];
for (const [src, sub] of errCases) {
  const res = compile(src);
  const msgs = res.errors.map((e) => e.message + ' | ' + e.hint).join('\n');
  check('erro: ' + src, !res.ok && msgs.includes(sub), msgs || '(sem erros)');
}

// ---- erros de execução
const rtCases = [
  ['var v: array[1..3] of integer; i: integer; begin for i := 1 to 4 do v[i] := i; end.', 'fora dos limites'],
  ['var a, b: integer; begin a := 1; b := 0; writeln(a div b); end.', 'Divisão por zero'],
  ['var x: integer; begin readln(x); end.', 'não é um número inteiro', ['abc']],
  ['function f(n: integer): integer; begin f := f(n + 1); end; begin writeln(f(1)); end.', 'recursão'],
];
for (const [src, sub, inp] of rtCases) {
  const r = await runProgram(src, inp || []);
  check('runtime: ' + src, r.runtime && r.runtime.message.includes(sub), r.runtime ? r.runtime.message : JSON.stringify(r));
}

// ---- ida e volta: código → blocos → código
const { codeToBlocks } = await import('../js/blocks/fromAst.js');
const { generate } = await import('../js/blocks/codegen.js');
for (const ex of EXAMPLES) {
  let gen;
  try {
    gen = generate(codeToBlocks(ex.code)).code;
  } catch (e) {
    check('roundtrip ' + ex.id, false, e.stack);
    continue;
  }
  const res = compile(gen);
  if (!res.ok) {
    check('roundtrip ' + ex.id, false, gen + '\n' + res.errors.map((e) => `${e.line}: ${e.message}`).join('\n'));
    continue;
  }
  if (ex.expect !== undefined) {
    const r = await runProgram(gen, ex.input || []);
    check('roundtrip ' + ex.id, r.out === ex.expect, gen + '\n' + JSON.stringify(r.out));
  } else check('roundtrip ' + ex.id, true);
  // segunda volta deve ser estável
  const gen2 = generate(codeToBlocks(gen)).code;
  check('roundtrip estável ' + ex.id, gen2 === gen, gen + '\n----\n' + gen2);
  // metadados didáticos presentes
  check('didático ' + ex.id, Boolean(ex.summary && ex.concepts?.length && ex.steps?.length && ex.tip && ex.challenge), 'campos didáticos faltando em ' + ex.id);
}

// ---- documentação
const { STDLIB_DOCS, BLOCK_DOCS, COMMON_ERRORS_DOC, CRT_COLORS_DOC } = await import('../js/docs.js');
check('docs stdlib >= 40 funções', STDLIB_DOCS.length >= 40, String(STDLIB_DOCS.length));
check('docs blocos >= 20', BLOCK_DOCS.length >= 20, String(BLOCK_DOCS.length));
check('docs erros >= 6', COMMON_ERRORS_DOC.length >= 6, String(COMMON_ERRORS_DOC.length));
check('docs cores crt = 16', CRT_COLORS_DOC.length === 16, String(CRT_COLORS_DOC.length));
if (process.argv[2] === 'show') console.log(generate(codeToBlocks(EXAMPLES.find((e) => e.id === process.argv[3]).code)).code);

console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
