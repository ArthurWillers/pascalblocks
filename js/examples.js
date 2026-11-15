// Programas de exemplo didáticos (também usados nos testes automatizados).
export const EXAMPLES = [
  {
    id: 'ola',
    title: 'Olá, mundo!',
    level: 'Básico',
    summary: 'Mostra uma mensagem na tela, pergunta o nome da pessoa pelo teclado e exibe uma saudação personalizada.',
    concepts: ['program', 'var (string)', 'writeln / write', 'readln', 'clrscr'],
    steps: [
      'Declara a variável "nome" do tipo "string" (texto) para guardar o que a pessoa digitar.',
      'Limpa a tela com "clrscr" e mostra "Olá, mundo!" com "writeln".',
      'Faz a pergunta com "write" (sem pular linha) e espera a pessoa digitar com "readln(nome)".',
      'Junta o texto fixo com o valor guardado na variável "nome" dentro do "writeln".',
    ],
    tip: 'Em Pascal, textos fixos dentro do código vão entre apóstrofos simples (\'Olá\'), mas no bloco "writeln" você não precisa digitá-los nas partes de texto (T)!',
    challenge: 'Adicione uma variável "idade: integer", pergunte a idade da pessoa e mostre quantos anos ela terá daqui a 10 anos.',
    code: `program OlaMundo;
uses crt;
var
  nome: string;
begin
  clrscr;
  writeln('Olá, mundo!');
  write('Qual é o seu nome? ');
  readln(nome);
  writeln('Seja bem-vindo(a), ', nome, '!');
end.
`,
    input: ['Ana'],
    expect: 'Olá, mundo!\nQual é o seu nome? Ana\nSeja bem-vindo(a), Ana!\n',
  },
  {
    id: 'media',
    title: 'Média de 3 notas',
    level: 'Básico',
    summary: 'Lê 3 notas com casas decimais (real), calcula a média aritmética e diz se o aluno foi aprovado, ficou em recuperação ou foi reprovado.',
    concepts: ['real', 'expressões (+, /)', 'formatação :0:2', 'if / then / else'],
    steps: [
      'Declara quatro variáveis do tipo "real" (números com vírgula/ponto decimal): n1, n2, n3 e media.',
      'Lê as três notas digitadas pelo usuário.',
      'Calcula "media := (n1 + n2 + n3) / 3". Os parênteses garantem que a soma seja feita antes da divisão!',
      'Mostra a média formatada com 2 casas decimais usando "media:0:2" (no bloco writeln, campo ":fmt" = 0:2).',
      'Usa "if ... then ... else" encadeado para verificar se a média é maior ou igual a 7, entre 5 e 7, ou menor que 5.',
    ],
    tip: 'Sem parênteses, "n1 + n2 + n3 / 3" dividiria apenas "n3" por 3! Sempre use parênteses ao somar antes de dividir.',
    challenge: 'Mude o programa para ler também uma 4ª nota (n4) e calcular a média das 4 notas.',
    code: `program MediaNotas;
var
  n1, n2, n3, media: real;
begin
  write('Nota 1: ');
  readln(n1);
  write('Nota 2: ');
  readln(n2);
  write('Nota 3: ');
  readln(n3);
  media := (n1 + n2 + n3) / 3;
  writeln('Média: ', media:0:2);
  if media >= 7 then
    writeln('Aprovado!')
  else if media >= 5 then
    writeln('Em recuperação')
  else
    writeln('Reprovado');
end.
`,
    input: ['7', '8.5', '6'],
    expect: 'Nota 1: 7\nNota 2: 8.5\nNota 3: 6\nMédia: 7.17\nAprovado!\n',
  },
  {
    id: 'parimpar',
    title: 'Par ou ímpar',
    level: 'Básico',
    summary: 'Verifica se um número inteiro digitado é par ou ímpar usando o operador de resto da divisão (mod).',
    concepts: ['integer', 'operador mod', 'if / then / else', 'comparação ='],
    steps: [
      'Lê um número inteiro e guarda na variável "n".',
      'Calcula "n mod 2", que devolve o resto da divisão inteira de "n" por 2.',
      'Se o resto for igual a 0 ("n mod 2 = 0"), o número é par; caso contrário ("else"), é ímpar.',
    ],
    tip: 'Note a diferença: ":=" atribui um valor (guarda na variável), enquanto "=" apenas compara dois valores dentro do "if".',
    challenge: 'Adicione outro "if" para verificar também se o número digitado é múltiplo de 5 ("n mod 5 = 0").',
    code: `program ParOuImpar;
var
  n: integer;
begin
  write('Digite um número inteiro: ');
  readln(n);
  if n mod 2 = 0 then
    writeln(n, ' é par')
  else
    writeln(n, ' é ímpar');
end.
`,
    input: ['7'],
    expect: 'Digite um número inteiro: 7\n7 é ímpar\n',
  },
  {
    id: 'calculadora',
    title: 'Calculadora (case)',
    level: 'Condicionais',
    summary: 'Lê dois números e um símbolo de operação (+, -, *, /) e usa a estrutura "case ... of" para executar o cálculo escolhido.',
    concepts: ['char', 'real', 'case ... of', 'proteção contra divisão por zero'],
    steps: [
      'Declara "a, b: real" para os números e "op: char" (um único caractere) para a operação.',
      'Lê o primeiro número, o símbolo da operação e o segundo número.',
      'O bloco "case op of" escolhe qual linha executar dependendo do caractere digitado em "op".',
      'No caso da divisão (\'/\'), um "if b <> 0" impede o erro de divisão por zero.',
    ],
    tip: 'O comando "case" é ideal quando você quer testar vários valores exatos (números inteiros ou caracteres) de uma mesma variável.',
    challenge: 'Adicione uma opção \'^\' no case que calcule o quadrado do primeiro número usando "sqr(a)".',
    code: `program Calculadora;
var
  a, b: real;
  op: char;
begin
  write('Primeiro número: ');
  readln(a);
  write('Operação (+ - * /): ');
  readln(op);
  write('Segundo número: ');
  readln(b);
  case op of
    '+': writeln('Resultado: ', a + b:0:2);
    '-': writeln('Resultado: ', a - b:0:2);
    '*': writeln('Resultado: ', a * b:0:2);
    '/':
      if b <> 0 then
        writeln('Resultado: ', a / b:0:2)
      else
        writeln('Erro: divisão por zero!');
  else
    writeln('Operação inválida');
  end;
end.
`,
    input: ['10', '/', '4'],
    expect: 'Primeiro número: 10\nOperação (+ - * /): /\nSegundo número: 4\nResultado: 2.50\n',
  },
  {
    id: 'triangulo',
    title: 'Área do triângulo (Heron)',
    level: 'Condicionais',
    summary: 'Verifica se três medidas podem formar um triângulo e, se puderem, calcula sua área pela fórmula de Heron.',
    concepts: ['operador lógico and', 'função sqrt()', 'condição composta com parênteses'],
    steps: [
      'Lê as medidas dos três lados: "a", "b" e "c".',
      'Verifica a condição de existência do triângulo: cada lado deve ser menor que a soma dos outros dois.',
      'Se existir, calcula o semiperímetro "s := (a + b + c) / 2" e a área pela raiz quadrada "sqrt(...)".',
      'Se não formar triângulo, executa o bloco "else" informando que não existe.',
    ],
    tip: 'Em Pascal, ao combinar comparações com "and" ou "or", cada comparação DEVE estar entre parênteses: "(a < b + c) and (b < a + c)".',
    challenge: 'Quando o triângulo existir, mostre também o perímetro (soma dos três lados).',
    code: `program Area;
uses crt;
var
  a, b, c, s, ar: real;
begin
  writeln('Forneça os lados do triângulo');
  readln(a);
  readln(b);
  readln(c);
  if (a < b + c) and (b < a + c) and (c < a + b) then
  begin
    s := (a + b + c) / 2;
    ar := sqrt(s * (s - a) * (s - b) * (s - c));
    writeln('Tem área ', ar:0:2);
  end
  else
    writeln('Não existe');
end.
`,
    input: ['3', '4', '5'],
    expect: 'Forneça os lados do triângulo\n3\n4\n5\nTem área 6.00\n',
  },
  {
    id: 'tabuada',
    title: 'Tabuada (for)',
    level: 'Repetição',
    summary: 'Usa o laço "for" para contar automaticamente de 1 até 10 e mostrar a tabuada completa de qualquer número.',
    concepts: ['for ... to ... do', 'variável contadora (i)', 'alinhamento :largura'],
    steps: [
      'Lê o número "n" cuja tabuada queremos ver.',
      'O laço "for i := 1 to 10 do" repete o "writeln" 10 vezes, fazendo "i" valer 1, 2, 3... até 10.',
      'Em cada volta, multiplica "n * i" e usa ":2" e ":3" na formatação para alinhar os números em colunas.',
    ],
    tip: 'Execute este exemplo no modo "👣 Passo a passo" e observe no painel de Variáveis o valor de "i" subindo de 1 até 10!',
    challenge: 'Altere o limite final do "for" de 10 para 20, ou mude "to" para "downto" (de 10 até 1) para ver a tabuada de trás para frente.',
    code: `program Tabuada;
var
  n, i: integer;
begin
  write('Tabuada de qual número? ');
  readln(n);
  for i := 1 to 10 do
    writeln(n:2, ' x ', i:2, ' = ', n * i:3);
end.
`,
    input: ['7'],
    expect: 'Tabuada de qual número? 7\n 7 x  1 =   7\n 7 x  2 =  14\n 7 x  3 =  21\n 7 x  4 =  28\n 7 x  5 =  35\n 7 x  6 =  42\n 7 x  7 =  49\n 7 x  8 =  56\n 7 x  9 =  63\n 7 x 10 =  70\n',
  },
  {
    id: 'somawhile',
    title: 'Soma até digitar 0 (while)',
    level: 'Repetição',
    summary: 'Lê vários números sem saber quantos serão de antemão, somando todos enquanto o número digitado for diferente de zero.',
    concepts: ['while ... do', 'acumulador (soma)', 'contador (qtd)', 'diferente (<>)'],
    steps: [
      'Zera o acumulador "soma := 0" e o contador "qtd := 0" antes de começar.',
      'Lê o primeiro número antes do laço.',
      'Enquanto "n <> 0" (n for diferente de zero), soma "n" ao total, aumenta "qtd" em 1 e pede o próximo número.',
      'Quando o usuário digita 0, o laço "while" termina e o programa mostra a soma e a média.',
    ],
    tip: 'O laço "while" testa a condição ANTES de entrar: se o primeiro número digitado já for 0, o interior do laço nem executa.',
    challenge: 'Crie uma variável "maior: integer" para guardar e exibir também qual foi o maior número digitado antes do 0.',
    code: `program SomaAteZero;
var
  n, soma, qtd: integer;
begin
  soma := 0;
  qtd := 0;
  write('Número (0 para parar): ');
  readln(n);
  while n <> 0 do
  begin
    soma := soma + n;
    qtd := qtd + 1;
    write('Número (0 para parar): ');
    readln(n);
  end;
  writeln('Soma: ', soma);
  if qtd > 0 then
    writeln('Média: ', soma / qtd:0:2);
end.
`,
    input: ['4', '6', '5', '0'],
    expect: 'Número (0 para parar): 4\nNúmero (0 para parar): 6\nNúmero (0 para parar): 5\nNúmero (0 para parar): 0\nSoma: 15\nMédia: 5.00\n',
  },
  {
    id: 'adivinha',
    title: 'Adivinhe o número (repeat)',
    level: 'Repetição',
    summary: 'Jogo em que o computador sorteia um número secreto de 1 a 100 e dá dicas ("Mais alto!" / "Mais baixo!") até você acertar.',
    concepts: ['repeat ... until', 'randomize / random()', 'contador de tentativas'],
    steps: [
      '"randomize" prepara o sorteador e "random(100) + 1" sorteia um número entre 1 e 100.',
      'O laço "repeat ... until chute = secreto" pede um palpite e conta uma tentativa.',
      'Dá dicas comparando o "chute" com o "secreto".',
      'O laço só para quando a condição do "until" ("chute = secreto") se torna verdadeira!',
    ],
    tip: 'Diferente do "while" (que repete ENQUANTO a condição é verdadeira), o "repeat ... until" repete ATÉ QUE a condição se torne verdadeira.',
    challenge: 'Mostre uma mensagem especial se a pessoa conseguir acertar em no máximo 5 tentativas!',
    code: `program Adivinha;
var
  secreto, chute, tentativas: integer;
begin
  randomize;
  secreto := random(100) + 1;
  tentativas := 0;
  writeln('Pensei em um número de 1 a 100.');
  repeat
    write('Seu palpite: ');
    readln(chute);
    tentativas := tentativas + 1;
    if chute < secreto then
      writeln('Mais alto!')
    else if chute > secreto then
      writeln('Mais baixo!');
  until chute = secreto;
  writeln('Acertou em ', tentativas, ' tentativas!');
end.
`,
  },
  {
    id: 'vetor',
    title: 'Vetor: maior, menor e média',
    level: 'Vetores',
    summary: 'Armazena 5 números em um vetor (array) e percorre os elementos para descobrir o maior, o menor e a média.',
    concepts: ['const', 'array[1..N] of integer', 'índice v[i]', 'laço for'],
    steps: [
      'Define a constante "N = 5" e declara o vetor "v: array[1..N] of integer" (5 gavetas numeradas de 1 a 5).',
      'O primeiro "for" lê os 5 valores, guardando cada um na posição "v[i]".',
      'Inicializa "maior" e "menor" com o primeiro elemento "v[1]".',
      'O segundo "for" compara cada "v[i]" com o maior e o menor atuais e acumula a soma.',
    ],
    tip: 'No painel de Variáveis, você pode ver todas as posições do vetor "v" (ex.: [3, 9, 1, 7, 5]) mudando ao vivo!',
    challenge: 'Ao final, mostre os 5 números na ordem inversa à que foram digitados usando um laço "for i := N downto 1".',
    code: `program Vetor;
const
  N = 5;
var
  v: array[1..N] of integer;
  i, maior, menor, soma: integer;
begin
  for i := 1 to N do
  begin
    write('Valor ', i, ': ');
    readln(v[i]);
  end;
  maior := v[1];
  menor := v[1];
  soma := 0;
  for i := 1 to N do
  begin
    if v[i] > maior then
      maior := v[i];
    if v[i] < menor then
      menor := v[i];
    soma := soma + v[i];
  end;
  writeln('Maior: ', maior);
  writeln('Menor: ', menor);
  writeln('Média: ', soma / N:0:1);
end.
`,
    input: ['3', '9', '1', '7', '5'],
    expect: 'Valor 1: 3\nValor 2: 9\nValor 3: 1\nValor 4: 7\nValor 5: 5\nMaior: 9\nMenor: 1\nMédia: 5.0\n',
  },
  {
    id: 'bubble',
    title: 'Ordenação (Bubble Sort)',
    level: 'Vetores',
    summary: 'Preenche um vetor de 8 números aleatórios e os coloca em ordem crescente usando o clássico algoritmo da bolha (Bubble Sort).',
    concepts: ['array', 'laços for aninhados', 'troca com variável auxiliar (aux)'],
    steps: [
      'Sorteia 8 números entre 0 e 99 e mostra o vetor original.',
      'Dois laços "for" aninhados comparam elementos vizinhos: "v[j]" e "v[j + 1]".',
      'Quando o elemento da esquerda é maior que o da direita ("v[j] > v[j + 1]"), troca os dois de lugar usando a variável "aux".',
      'Ao final, exibe o vetor totalmente ordenado em ordem crescente.',
    ],
    tip: 'Para trocar dois valores entre si ("a" e "b"), precisamos de uma terceira variável temporária ("aux := a; a := b; b := aux;").',
    challenge: 'Mude a comparação de ">" para "<" ("if v[j] < v[j + 1]") para ordenar em ordem decrescente (do maior para o menor).',
    code: `program BubbleSort;
var
  v: array[1..8] of integer;
  i, j, aux: integer;
begin
  randomize;
  for i := 1 to 8 do
    v[i] := random(100);
  write('Original: ');
  for i := 1 to 8 do
    write(v[i], ' ');
  writeln;
  for i := 1 to 7 do
    for j := 1 to 8 - i do
      if v[j] > v[j + 1] then
      begin
        aux := v[j];
        v[j] := v[j + 1];
        v[j + 1] := aux;
      end;
  write('Ordenado: ');
  for i := 1 to 8 do
    write(v[i], ' ');
  writeln;
end.
`,
  },
  {
    id: 'matriz',
    title: 'Matriz 3x3 e Diagonal',
    level: 'Vetores',
    summary: 'Cria uma tabela 3x3 (matriz bidimensional), preenche cada posição [linha, coluna] e calcula a soma da diagonal principal.',
    concepts: ['array[1..3, 1..3]', 'índices [i, j]', 'diagonal principal [i, i]'],
    steps: [
      'Declara "m: array[1..3, 1..3] of integer", uma matriz com 3 linhas e 3 colunas.',
      'Usa dois laços ("i" para linha e "j" para coluna) para preencher "m[i, j] := i * j".',
      'Imprime cada linha formatada com ":4" e, ao fim de cada linha, usa "writeln" vazio para quebrar a linha.',
      'Soma os elementos onde a linha é igual à coluna ("m[i, i]"): posições [1,1], [2,2] e [3,3].',
    ],
    tip: 'Sempre que trabalhar com tabelas/matrizes, use dois contadores: um para a linha (i) e outro para a coluna (j).',
    challenge: 'Calcule também a soma de TODOS os 9 elementos da matriz.',
    code: `program Matriz;
var
  m: array[1..3, 1..3] of integer;
  i, j, diag: integer;
begin
  for i := 1 to 3 do
    for j := 1 to 3 do
      m[i, j] := i * j;
  diag := 0;
  for i := 1 to 3 do
  begin
    for j := 1 to 3 do
      write(m[i, j]:4);
    writeln;
    diag := diag + m[i, i];
  end;
  writeln('Soma da diagonal: ', diag);
end.
`,
    expect: '   1   2   3\n   2   4   6\n   3   6   9\nSoma da diagonal: 14\n',
  },
  {
    id: 'strings',
    title: 'Manipulando textos (Strings)',
    level: 'Textos',
    summary: 'Lê uma frase, inverte suas letras de trás para frente, converte para maiúsculas e conta quantas vogais ela possui.',
    concepts: ['string', 'length(s)', 'acesso por letra s[i]', 'upcase()', 'operador in [...]'],
    steps: [
      '"frase" e "invertida" são declaradas como "string" (texto), enquanto "i" e "vogais" são "integer".',
      '"length(frase)" descobre quantos caracteres a frase tem.',
      'O primeiro laço usa "downto 1" (do último caractere até o 1º) para montar a palavra de trás para frente.',
      'O segundo laço verifica se cada letra em maiúscula ("upcase(frase[i])") pertence ao conjunto de vogais "[\'A\', \'E\', \'I\', \'O\', \'U\']".',
    ],
    tip: 'Em Pascal, o primeiro caractere de uma string fica na posição 1 ("frase[1]"), e o último fica em "frase[length(frase)]".',
    challenge: 'Conte também quantos espaços em branco (\' \') existem na frase digitada.',
    code: `program Textos;
var
  frase, invertida: string;
  i, vogais: integer;
begin
  write('Digite uma frase: ');
  readln(frase);
  invertida := '';
  vogais := 0;
  for i := length(frase) downto 1 do
    invertida := invertida + frase[i];
  for i := 1 to length(frase) do
    if upcase(frase[i]) in ['A', 'E', 'I', 'O', 'U'] then
      vogais := vogais + 1;
  writeln('Maiúsculas: ', upcase(frase));
  writeln('Invertida:  ', invertida);
  writeln('Tamanho:    ', length(frase));
  writeln('Vogais:     ', vogais);
end.
`,
    input: ['Pascal Blocks'],
    expect: 'Digite uma frase: Pascal Blocks\nMaiúsculas: PASCAL BLOCKS\nInvertida:  skcolB lacsaP\nTamanho:    13\nVogais:     3\n',
  },
  {
    id: 'troca',
    title: 'Troca de valores (procedure var)',
    level: 'Sub-rotinas',
    summary: 'Mostra como criar um procedimento ("procedure") com parâmetros por referência ("var") para alterar variáveis do programa principal.',
    concepts: ['procedure', 'parâmetros por referência (var)', 'variável local (aux)'],
    steps: [
      'Declara o procedimento "troca(var a, b: integer)". A palavra "var" nos parâmetros significa que alterações em "a" e "b" afetarão diretamente as variáveis passadas!',
      'Dentro do procedimento, usa a variável local "aux" para trocar os valores de "a" e "b".',
      'No programa principal, atribui "x := 10" e "y := 20", chama "troca(x, y)" e mostra que os valores foram trocados.',
    ],
    tip: 'Se você remover a palavra "var" de "procedure troca(var a, b: integer)", o procedimento só alterará cópias locais e "x" e "y" continuarão valendo 10 e 20!',
    challenge: 'Rode no modo "👣 Passo a passo" para ver o escopo do procedimento "troca" aparecer na tabela de Variáveis.',
    code: `program TrocaValores;
var
  x, y: integer;

procedure troca(var a, b: integer);
var
  aux: integer;
begin
  aux := a;
  a := b;
  b := aux;
end;

begin
  x := 10;
  y := 20;
  writeln('Antes:  x = ', x, ', y = ', y);
  troca(x, y);
  writeln('Depois: x = ', x, ', y = ', y);
end.
`,
    expect: 'Antes:  x = 10, y = 20\nDepois: x = 20, y = 10\n',
  },
  {
    id: 'fatorial',
    title: 'Fatorial (função recursiva)',
    level: 'Sub-rotinas',
    summary: 'Cria uma função ("function") que chama a si mesma (recursão) para calcular o fatorial n! = n × (n - 1)! de 0 até 10.',
    concepts: ['function', 'retorno de função', 'recursão', 'caso base'],
    steps: [
      'A função "fat(n: integer): integer" recebe um inteiro "n" e devolve um inteiro.',
      'Caso base: se "n <= 1", o fatorial vale 1 ("fat := 1").',
      'Passo recursivo: senão, multiplica "n" pelo fatorial do número anterior ("n * fat(n - 1)").',
      'O programa principal chama "fat(i)" dentro de um laço de 0 a 10.',
    ],
    tip: 'Em Pascal, para definir o valor que uma "function" devolve, atribuímos o resultado ao próprio nome da função (ex.: "fat := 1") ou a "Result".',
    challenge: 'Crie uma função parecida "somaAte(n: integer): integer" que some todos os números de 1 até n.',
    code: `program Fatorial;

function fat(n: integer): integer;
begin
  if n <= 1 then
    fat := 1
  else
    fat := n * fat(n - 1);
end;

var
  i: integer;
begin
  for i := 0 to 10 do
    writeln(i:2, '! = ', fat(i));
end.
`,
    expect: ' 0! = 1\n 1! = 1\n 2! = 2\n 3! = 6\n 4! = 24\n 5! = 120\n 6! = 720\n 7! = 5040\n 8! = 40320\n 9! = 362880\n10! = 3628800\n',
  },
  {
    id: 'primos',
    title: 'Números primos (função boolean)',
    level: 'Sub-rotinas',
    summary: 'Define uma função que devolve verdadeiro ou falso ("boolean") indicando se um número é primo, e lista todos os primos até 50.',
    concepts: ['function : boolean', 'while d * d <= n', 'exit', 'mod'],
    steps: [
      'A função "ehPrimo(n: integer): boolean" começa assumindo que "n >= 2".',
      'Testa divisores "d" começando em 2 até a raiz quadrada de "n" ("d * d <= n").',
      'Se encontrar algum divisor exato ("n mod d = 0"), marca "ehPrimo := false" e sai imediatamente da função com "exit".',
      'No programa principal, testa "if ehPrimo(i) then" para todos os números de 1 a 50.',
    ],
    tip: 'Funções que retornam "boolean" podem ser usadas diretamente como condição dentro de um "if", deixando o código muito fácil de ler!',
    challenge: 'Mude o laço principal para mostrar os números primos de 1 até 100.',
    code: `program Primos;

function ehPrimo(n: integer): boolean;
var
  d: integer;
begin
  ehPrimo := n >= 2;
  d := 2;
  while d * d <= n do
  begin
    if n mod d = 0 then
    begin
      ehPrimo := false;
      exit;
    end;
    d := d + 1;
  end;
end;

var
  i, cont: integer;
begin
  cont := 0;
  for i := 1 to 50 do
    if ehPrimo(i) then
    begin
      write(i, ' ');
      cont := cont + 1;
    end;
  writeln;
  writeln('Total: ', cont, ' primos');
end.
`,
    expect: '2 3 5 7 11 13 17 19 23 29 31 37 41 43 47 \nTotal: 15 primos\n',
  },
  {
    id: 'record',
    title: 'Cadastro com Record (Registro)',
    level: 'Avançado',
    summary: 'Cria um tipo estruturado "TAluno" (record) que agrupa nome e nota, guarda uma turma de 3 alunos e exibe o boletim formatado.',
    concepts: ['type ... = record', 'array de records', 'acesso a campo .nome / .nota'],
    steps: [
      'Define o tipo "TAluno = record" contendo dois campos de tipos diferentes: "nome: string" e "nota: real".',
      'Declara o vetor "turma: array[1..3] of TAluno", onde cada posição guarda um aluno completo.',
      'Lê "turma[i].nome" e "turma[i].nota" usando o ponto (.) para acessar os campos do registro.',
      'Imprime a tabela alinhada e a média geral da turma.',
    ],
    tip: 'Enquanto um "array" guarda vários valores do MESMO tipo, um "record" agrupa campos de tipos DIFERENTES (como texto + número) em uma única variável.',
    challenge: 'Adicione um campo "idade: integer" dentro do record TAluno.',
    code: `program Cadastro;
type
  TAluno = record
    nome: string;
    nota: real;
  end;
var
  turma: array[1..3] of TAluno;
  i: integer;
  soma: real;
begin
  soma := 0;
  for i := 1 to 3 do
  begin
    write('Nome do aluno ', i, ': ');
    readln(turma[i].nome);
    write('Nota: ');
    readln(turma[i].nota);
    soma := soma + turma[i].nota;
  end;
  writeln;
  for i := 1 to 3 do
    writeln(turma[i].nome:10, turma[i].nota:6:1);
  writeln('Média da turma: ', soma / 3:0:2);
end.
`,
    input: ['Ana', '9', 'Bruno', '7.5', 'Caio', '6'],
    expect: 'Nome do aluno 1: Ana\nNota: 9\nNome do aluno 2: Bruno\nNota: 7.5\nNome do aluno 3: Caio\nNota: 6\n\n       Ana   9.0\n     Bruno   7.5\n      Caio   6.0\nMédia da turma: 7.50\n',
  },
  {
    id: 'cores',
    title: 'Cores no terminal (Unit CRT)',
    level: 'Avançado',
    summary: 'Demonstra o uso da biblioteca clássica "crt" para limpar a tela, mudar as cores do texto (1 a 15) e fazer pausas com "delay".',
    concepts: ['uses crt', 'clrscr', 'textcolor()', 'delay()'],
    steps: [
      'Ativa a unit "crt" no cabeçalho do programa ("uses crt;").',
      'Limpa o terminal com "clrscr".',
      'Percorre as cores de 1 a 15 mudando a cor ativa com "textcolor(i)" e fazendo uma pausa de 80ms com "delay(80)".',
      'Ao final, restaura a cor padrão clara com "textcolor(LightGray)".',
    ],
    tip: 'Você pode passar tanto o número da cor (0 a 15) quanto o nome da constante em Pascal: Blue, Green, Red, Yellow, White, LightCyan...',
    challenge: 'Teste usar "textbackground(Blue)" antes do "writeln" para mudar também a cor de fundo do texto!',
    code: `program Cores;
uses crt;
var
  i: integer;
begin
  clrscr;
  for i := 1 to 15 do
  begin
    textcolor(i);
    writeln('Cor número ', i);
    delay(80);
  end;
  textcolor(LightGray);
  writeln('Pronto!');
end.
`,
  },
];
