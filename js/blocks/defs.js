// Definições dos blocos: aparência, campos, encaixes e itens da paleta.
//
// Cada bloco tem:
//   cat   – categoria (cor)
//   kind  – 'stmt' (comando), 'decl' (declaração) ou 'caseitem'
//   rows  – linhas do bloco: arrays de itens (texto ou campo) ou { slot, accepts }
//   fields – valores padrão
//   tip   – explicação exibida ao passar o mouse

export const CATEGORIES = [
  { id: 'decl', name: 'Variáveis e constantes', color: '#16a34a' },
  { id: 'io', name: 'Entrada e saída', color: '#2563eb' },
  { id: 'calc', name: 'Atribuição e cálculo', color: '#0d9488' },
  { id: 'cond', name: 'Condicionais', color: '#ca8a04' },
  { id: 'loop', name: 'Repetição', color: '#ea580c' },
  { id: 'sub', name: 'Procedimentos e funções', color: '#7c3aed' },
  { id: 'crt', name: 'Tela (CRT)', color: '#475569' },
  { id: 'misc', name: 'Outros', color: '#64748b' },
];

export const CAT_COLOR = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color]));

export const TYPE_SUGGESTIONS = [
  'integer', 'real', 'string', 'char', 'boolean', 'longint',
  'array[1..10] of integer', 'array[1..10] of real', 'array[1..10] of string',
  'array[1..3, 1..3] of integer',
];

export const COLORS = [
  'Black', 'Blue', 'Green', 'Cyan', 'Red', 'Magenta', 'Brown', 'LightGray',
  'DarkGray', 'LightBlue', 'LightGreen', 'LightCyan', 'LightRed', 'LightMagenta', 'Yellow', 'White',
];

// Tipos de campo:
//  ident   – um identificador
//  idents  – lista de identificadores separados por vírgula
//  lvalue  – variável (pode ter índice/campo: v[i], aluno.nome)
//  lvalues – lista de variáveis
//  expr    – expressão Pascal
//  exprs   – lista de expressões (argumentos)
//  labels  – valores do case (1, 2, 5..9)
//  type    – tipo Pascal
//  params  – lista de parâmetros
//  text    – texto livre (sem apóstrofos)
//  code    – código Pascal livre (multilinha)
//  select  – lista de opções
//  check   – caixa de seleção
//  parts   – partes do writeln

export const BLOCKS = {
  program: {
    cat: 'prog',
    kind: 'root',
    fields: { name: 'MeuPrograma', crt: true },
  },

  // ------------------------------------------------------------ Declarações
  var: {
    cat: 'decl',
    kind: 'decl',
    rows: [['var', { f: 'names', t: 'idents', ph: 'nome' }, ':', { f: 'type', t: 'type', ph: 'tipo' }]],
    fields: { names: 'x', type: 'integer' },
    tip: 'Declara uma ou mais variáveis (separe os nomes com vírgula).',
  },
  const: {
    cat: 'decl',
    kind: 'decl',
    rows: [['const', { f: 'name', t: 'ident', ph: 'NOME' }, '=', { f: 'value', t: 'expr', ph: 'valor' }]],
    fields: { name: 'MAX', value: '10' },
    tip: 'Declara uma constante: um valor fixo que não muda durante o programa.',
  },
  typedecl: {
    cat: 'decl',
    kind: 'decl',
    rows: [['type', { f: 'name', t: 'ident', ph: 'TNome' }, '=', { f: 'def', t: 'type', ph: 'definição', wide: true }]],
    fields: { name: 'TVetor', def: 'array[1..10] of integer' },
    tip: 'Cria um novo tipo (array, record, enumeração...).',
  },
  rawdecl: {
    cat: 'misc',
    kind: 'decl',
    rows: [['declaração Pascal'], [{ f: 'code', t: 'code', ph: 'var x: integer = 0;' }]],
    fields: { code: '' },
    tip: 'Declaração escrita diretamente em Pascal.',
  },

  // ------------------------------------------------------------ Entrada e saída
  writeln: {
    cat: 'io',
    kind: 'stmt',
    rows: [[{ f: 'mode', t: 'select', options: ['writeln', 'write'] }, { f: 'parts', t: 'parts' }]],
    fields: { mode: 'writeln', parts: [{ k: 'text', v: 'Olá, mundo!' }] },
    tip: 'Mostra textos e valores na tela. writeln pula para a próxima linha no final; write não pula.',
  },
  readln: {
    cat: 'io',
    kind: 'stmt',
    rows: [[{ f: 'mode', t: 'select', options: ['readln', 'read'] }, '(', { f: 'vars', t: 'lvalues', ph: 'variável' }, ')']],
    fields: { mode: 'readln', vars: 'x' },
    tip: 'Lê um valor digitado pelo usuário e guarda na variável.',
  },
  ask: {
    cat: 'io',
    kind: 'stmt',
    rows: [['perguntar', { f: 'text', t: 'text', ph: 'pergunta' }, 'e ler em', { f: 'var', t: 'lvalue', ph: 'variável' }]],
    fields: { text: 'Digite um número: ', var: 'x' },
    tip: "Atalho para write('pergunta'); readln(variável);",
  },

  // ------------------------------------------------------------ Atribuição
  assign: {
    cat: 'calc',
    kind: 'stmt',
    rows: [[{ f: 'target', t: 'lvalue', ph: 'variável' }, ':=', { f: 'value', t: 'expr', ph: 'valor', wide: true }]],
    fields: { target: 'x', value: '0' },
    tip: 'Atribuição: guarda o resultado da expressão na variável.',
  },
  inc: {
    cat: 'calc',
    kind: 'stmt',
    rows: [[{ f: 'mode', t: 'select', options: ['inc', 'dec'] }, '(', { f: 'var', t: 'lvalue', ph: 'variável' }, ',', { f: 'amount', t: 'expr', ph: '1' }, ')']],
    fields: { mode: 'inc', var: 'i', amount: '1' },
    tip: 'inc aumenta e dec diminui uma variável inteira (por padrão em 1).',
  },

  // ------------------------------------------------------------ Condicionais
  if: {
    cat: 'cond',
    kind: 'stmt',
    rows: [['if', { f: 'cond', t: 'expr', ph: 'condição', wide: true }, 'then'], { slot: 'then' }],
    fields: { cond: 'x > 0' },
    tip: 'Se a condição for verdadeira, executa os comandos de dentro.',
  },
  ifelse: {
    cat: 'cond',
    kind: 'stmt',
    rows: [['if', { f: 'cond', t: 'expr', ph: 'condição', wide: true }, 'then'], { slot: 'then' }, ['else'], { slot: 'else' }],
    fields: { cond: 'x > 0' },
    tip: 'Se a condição for verdadeira executa o primeiro grupo, senão executa o segundo.',
  },
  case: {
    cat: 'cond',
    kind: 'stmt',
    rows: [['case', { f: 'expr', t: 'expr', ph: 'seletor' }, 'of'], { slot: 'items', accepts: 'caseitem' }, ['else'], { slot: 'else' }, ['end']],
    fields: { expr: 'opcao' },
    tip: 'Escolhe um caminho de acordo com o valor do seletor (inteiro, char ou string).',
  },
  caseitem: {
    cat: 'cond',
    kind: 'caseitem',
    rows: [[{ f: 'labels', t: 'labels', ph: 'valor' }, ':'], { slot: 'body' }],
    fields: { labels: '1' },
    tip: "Uma opção do case. Pode ter vários valores (1, 2) ou faixas (1..5, 'a'..'z').",
  },

  // ------------------------------------------------------------ Repetição
  for: {
    cat: 'loop',
    kind: 'stmt',
    rows: [['for', { f: 'var', t: 'ident', ph: 'i' }, ':=', { f: 'from', t: 'expr', ph: '1' },
      { f: 'dir', t: 'select', options: ['to', 'downto'] }, { f: 'to', t: 'expr', ph: '10' }, 'do'], { slot: 'body' }],
    fields: { var: 'i', from: '1', dir: 'to', to: '10' },
    tip: 'Repete os comandos contando de um valor até outro (to = crescente, downto = decrescente).',
  },
  while: {
    cat: 'loop',
    kind: 'stmt',
    rows: [['while', { f: 'cond', t: 'expr', ph: 'condição', wide: true }, 'do'], { slot: 'body' }],
    fields: { cond: 'x < 10' },
    tip: 'Repete enquanto a condição for verdadeira (testa antes de cada repetição).',
  },
  repeat: {
    cat: 'loop',
    kind: 'stmt',
    rows: [['repeat'], { slot: 'body' }, ['until', { f: 'cond', t: 'expr', ph: 'condição', wide: true }]],
    fields: { cond: 'x = 0' },
    tip: 'Repete até a condição ficar verdadeira (executa pelo menos uma vez).',
  },
  break: {
    cat: 'loop',
    kind: 'stmt',
    rows: [['break']],
    fields: {},
    tip: 'Sai imediatamente do laço atual.',
  },
  continue: {
    cat: 'loop',
    kind: 'stmt',
    rows: [['continue']],
    fields: {},
    tip: 'Pula para a próxima repetição do laço.',
  },

  // ------------------------------------------------------------ Sub-rotinas
  procedure: {
    cat: 'sub',
    kind: 'decl',
    rows: [['procedure', { f: 'name', t: 'ident', ph: 'Nome' }, '(', { f: 'params', t: 'params', ph: 'parâmetros' }, ')'],
      { slot: 'locals', accepts: 'decl', label: 'variáveis locais' }, ['begin'], { slot: 'body' }, ['end;']],
    fields: { name: 'MostrarLinha', params: '' },
    tip: "Procedimento: um grupo de comandos com nome. Parâmetros: 'a, b: integer; var r: real'.",
  },
  function: {
    cat: 'sub',
    kind: 'decl',
    rows: [['function', { f: 'name', t: 'ident', ph: 'Nome' }, '(', { f: 'params', t: 'params', ph: 'parâmetros' }, ')', ':', { f: 'ret', t: 'type', ph: 'tipo' }],
      { slot: 'locals', accepts: 'decl', label: 'variáveis locais' }, ['begin'], { slot: 'body' }, ['end;']],
    fields: { name: 'Dobro', params: 'n: integer', ret: 'integer' },
    tip: 'Função: calcula e devolve um valor. Defina o resultado com NomeDaFunção := valor.',
  },
  call: {
    cat: 'sub',
    kind: 'stmt',
    rows: [[{ f: 'name', t: 'ident', ph: 'nome' }, '(', { f: 'args', t: 'exprs', ph: 'argumentos' }, ')']],
    fields: { name: 'MostrarLinha', args: '' },
    tip: 'Chama (executa) um procedimento.',
  },
  return: {
    cat: 'sub',
    kind: 'stmt',
    rows: [['resultado :=', { f: 'value', t: 'expr', ph: 'valor', wide: true }]],
    fields: { value: '0' },
    tip: 'Define o valor que a função vai devolver (gera NomeDaFunção := valor).',
  },
  exit: {
    cat: 'sub',
    kind: 'stmt',
    rows: [['exit']],
    fields: {},
    tip: 'Sai imediatamente do procedimento/função atual (no programa principal, encerra).',
  },

  // ------------------------------------------------------------ Tela (CRT)
  clrscr: {
    cat: 'crt',
    kind: 'stmt',
    rows: [['clrscr']],
    fields: {},
    tip: 'Limpa a tela.',
  },
  textcolor: {
    cat: 'crt',
    kind: 'stmt',
    rows: [[{ f: 'mode', t: 'select', options: ['textcolor', 'textbackground'] }, '(', { f: 'color', t: 'select', options: COLORS }, ')']],
    fields: { mode: 'textcolor', color: 'Yellow' },
    tip: 'Muda a cor do texto (ou do fundo) do que for escrito depois.',
  },
  delay: {
    cat: 'crt',
    kind: 'stmt',
    rows: [['delay', '(', { f: 'ms', t: 'expr', ph: '500' }, ')']],
    fields: { ms: '500' },
    tip: 'Espera um tempo em milissegundos (1000 = 1 segundo).',
  },
  readkey: {
    cat: 'crt',
    kind: 'stmt',
    rows: [['readkey']],
    fields: {},
    tip: 'Espera o usuário apertar uma tecla.',
  },

  // ------------------------------------------------------------ Outros
  comment: {
    cat: 'misc',
    kind: 'stmt',
    rows: [['{', { f: 'text', t: 'text', ph: 'comentário', wide: true }, '}']],
    fields: { text: 'explicação' },
    tip: 'Comentário: um texto que explica o código e é ignorado na execução.',
  },
  raw: {
    cat: 'misc',
    kind: 'stmt',
    rows: [['código Pascal'], [{ f: 'code', t: 'code', ph: "writeln('...');" }]],
    fields: { code: '' },
    tip: 'Escreva comandos diretamente em Pascal.',
  },
  halt: {
    cat: 'misc',
    kind: 'stmt',
    rows: [['halt']],
    fields: {},
    tip: 'Encerra o programa imediatamente.',
  },
};

// Itens da paleta (com valores iniciais)
export const PALETTE = [
  { cat: 'decl', items: [
    { type: 'var', label: 'var x: integer', desc: 'nova variável' },
    { type: 'var', label: 'var nome: string', desc: 'variável de texto', fields: { names: 'nome', type: 'string' } },
    { type: 'var', label: 'var v: array', desc: 'vetor', fields: { names: 'v', type: 'array[1..10] of integer' } },
    { type: 'const', label: 'const MAX = 10', desc: 'constante' },
    { type: 'typedecl', label: 'type ... = record', desc: 'novo tipo (registro)', fields: { name: 'TAluno', def: 'record nome: string; nota: real; end' } },
  ] },
  { cat: 'io', items: [
    { type: 'writeln', label: "writeln('texto')", desc: 'mostrar texto' },
    { type: 'writeln', label: "writeln('...', x)", desc: 'mostrar texto e valor', fields: { mode: 'writeln', parts: [{ k: 'text', v: 'Resultado: ' }, { k: 'expr', v: 'x', fmt: '' }] } },
    { type: 'writeln', label: "write('texto')", desc: 'mostrar sem pular linha', fields: { mode: 'write', parts: [{ k: 'text', v: 'Digite: ' }] } },
    { type: 'readln', label: 'readln(x)', desc: 'ler valor digitado' },
    { type: 'ask', label: 'perguntar e ler', desc: 'write + readln' },
    { type: 'writeln', label: 'writeln', desc: 'linha em branco', fields: { mode: 'writeln', parts: [] } },
  ] },
  { cat: 'calc', items: [
    { type: 'assign', label: 'x := valor', desc: 'atribuição' },
    { type: 'assign', label: 'x := x + 1', desc: 'contador / acumulador', fields: { target: 'x', value: 'x + 1' } },
    { type: 'inc', label: 'inc(i)', desc: 'incrementar / decrementar' },
  ] },
  { cat: 'cond', items: [
    { type: 'if', label: 'if ... then', desc: 'se' },
    { type: 'ifelse', label: 'if ... then ... else', desc: 'se / senão' },
    { type: 'case', label: 'case ... of', desc: 'escolha', withItems: true },
    { type: 'caseitem', label: 'opção do case', desc: 'valor: comandos' },
  ] },
  { cat: 'loop', items: [
    { type: 'for', label: 'for i := 1 to 10 do', desc: 'para (contador)' },
    { type: 'while', label: 'while ... do', desc: 'enquanto' },
    { type: 'repeat', label: 'repeat ... until', desc: 'repita até' },
    { type: 'break', label: 'break', desc: 'sair do laço' },
    { type: 'continue', label: 'continue', desc: 'próxima repetição' },
  ] },
  { cat: 'sub', items: [
    { type: 'procedure', label: 'procedure', desc: 'procedimento' },
    { type: 'function', label: 'function', desc: 'função' },
    { type: 'call', label: 'chamar procedimento', desc: 'executar' },
    { type: 'return', label: 'resultado := valor', desc: 'retorno da função' },
    { type: 'exit', label: 'exit', desc: 'sair da rotina' },
  ] },
  { cat: 'crt', items: [
    { type: 'clrscr', label: 'clrscr', desc: 'limpar tela' },
    { type: 'textcolor', label: 'textcolor(cor)', desc: 'cor do texto' },
    { type: 'delay', label: 'delay(ms)', desc: 'esperar' },
    { type: 'readkey', label: 'readkey', desc: 'esperar tecla' },
  ] },
  { cat: 'misc', items: [
    { type: 'comment', label: '{ comentário }', desc: 'anotação' },
    { type: 'raw', label: 'código Pascal', desc: 'comando livre' },
    { type: 'rawdecl', label: 'declaração Pascal', desc: 'declaração livre' },
    { type: 'halt', label: 'halt', desc: 'encerrar programa' },
  ] },
];

// Trechos inseríveis em campos de expressão
export const SNIPPETS = [
  { group: 'Aritméticos', items: [
    { s: '+', d: 'soma (ou junta textos)' }, { s: '-', d: 'subtração' }, { s: '*', d: 'multiplicação' },
    { s: '/', d: 'divisão (resultado real)' }, { s: 'div', d: 'divisão inteira: 7 div 2 = 3' },
    { s: 'mod', d: 'resto da divisão: 7 mod 2 = 1' }, { s: '( )', d: 'parênteses' },
  ] },
  { group: 'Comparação', items: [
    { s: '=', d: 'igual' }, { s: '<>', d: 'diferente' }, { s: '<', d: 'menor' }, { s: '>', d: 'maior' },
    { s: '<=', d: 'menor ou igual' }, { s: '>=', d: 'maior ou igual' },
  ] },
  { group: 'Lógicos', items: [
    { s: 'and', d: 'e: (a > 0) and (b > 0)' }, { s: 'or', d: 'ou: (x = 1) or (x = 2)' }, { s: 'not', d: 'não: not (x > 0)' },
    { s: 'true', d: 'verdadeiro' }, { s: 'false', d: 'falso' }, { s: 'in [ ]', d: "pertence: c in ['a'..'z']" },
  ] },
  { group: 'Matemática', items: [
    { s: 'sqrt( )', d: 'raiz quadrada' }, { s: 'sqr( )', d: 'quadrado (x²)' }, { s: 'abs( )', d: 'valor absoluto' },
    { s: 'power( , )', d: 'potência: power(2, 10)' }, { s: 'round( )', d: 'arredondar' }, { s: 'trunc( )', d: 'parte inteira' },
    { s: 'random( )', d: 'número aleatório de 0 a n-1' }, { s: 'pi', d: '3.14159...' }, { s: 'odd( )', d: 'é ímpar?' },
  ] },
  { group: 'Texto', items: [
    { s: 'length( )', d: 'tamanho do texto' }, { s: 'copy( , , )', d: 'pedaço: copy(s, início, qtd)' },
    { s: 'pos( , )', d: 'posição: pos(trecho, s)' }, { s: 'upcase( )', d: 'MAIÚSCULAS' }, { s: 'lowercase( )', d: 'minúsculas' },
    { s: 'IntToStr( )', d: 'número → texto' }, { s: 'StrToInt( )', d: 'texto → número' },
    { s: 'ord( )', d: 'código do caractere' }, { s: 'chr( )', d: 'caractere do código' }, { s: "''", d: 'texto entre apóstrofos' },
  ] },
];

