# Pascal :: Blocks

> **Nota sobre este repositório:** Este é um **fork vibecodado** do projeto original *Pascal :: Blocks*. A aplicação foi amplamente reestruturada para rodar **100% client-side** com compilador/interpretador Pascal próprio, blocos estruturados aninhados, editor de código manual, conversão bidirecional (Blocos <-> Código), depurador passo a passo com Console e Variáveis simultâneos, guia didático integrado e ícones SVG (estilo Lucide).

**Pascal :: Blocks** é um ambiente educacional baseado em **programação em blocos**, voltado ao ensino de **Algoritmos e Lógica de Programação** utilizando a **linguagem Pascal** como referência sintática e semântica real.

---

## Objetivos do Projeto

- Facilitar o ensino de **lógica de programação** para iniciantes
- Aproximar estudantes da **sintaxe real do Pascal**, evitando abstrações artificiais
- Permitir a transição gradual entre **programação visual** e **programação textual**
- Servir como **ferramenta pedagógica** e **recurso educacional aberto**

---

## Principais Funcionalidades

### Programação em Blocos (estruturados)
- Blocos **aninhados**: `if`, `for`, `while`, `repeat`, `case`, `procedure` e `function` têm encaixes internos — não é preciso montar `begin`, `end` e `;` à mão, o código gerado é sempre válido
- Campos editáveis direto no bloco (sem janelas de `prompt`), com **validação em tempo real** e autocompletar de variáveis
- `writeln`/`write` com partes de **texto** e **valor**, incluindo formatação (`media:0:2`) — sem precisar brigar com apóstrofos
- Bloco **perguntar e ler** (`write` + `readln`), `inc`/`dec`, `case` com opções, sub-rotinas com parâmetros e variáveis locais, `break`/`continue`/`exit`, cores e tela (unit CRT), comentários e bloco de **código Pascal livre**
- Operadores e funções (`div`, `mod`, `and`, `sqrt`, `length`, `copy`...) inseridos com um clique no campo selecionado
- Arrastar e soltar (mouse ou toque), duplicar, copiar/colar, desfazer/refazer e navegação por teclado

### Editor de Código
- Aba **Código** para escrever Pascal livremente, com realce de sintaxe, números de linha e erros marcados enquanto se digita
- **Conversão nos dois sentidos**: blocos -> código e código -> blocos

### Compilador + Interpretador Pascal (100% no navegador)
- Analisador léxico, sintático e **semântico** (verificação de tipos) com mensagens e dicas em português
- Tipos: `integer`, `real`, `boolean`, `char`, `string`, arrays (matrizes, índices `char`, dinâmicos), `record`, enumerações, conjuntos (`in`)
- `procedure`/`function` com parâmetros por valor, `var` e `const`, recursão e rotinas aninhadas
- Saída formatada idêntica ao Free Pascal (`writeln(x)` real em notação científica, `x:0:2`, `TRUE/FALSE`)
- `readln`/`read` interativos no console, erros de execução amigáveis (divisão por zero, índice fora dos limites, entrada inválida...)
- Funções das units CRT, Math, StrUtils e SysUtils mais usadas (`clrscr`, `textcolor`, `delay`, `readkey`, `IntToStr`, `StrToInt`, `UpperCase`...)

### Passo a Passo e Depuração
- Executa uma linha/bloco por vez, destacando o bloco e a linha atuais
- Painel dividido **Console & Variáveis** simultâneos para acompanhar saída, entrada (`readln`) e memória ao mesmo tempo
- Tabela de **variáveis** (inclusive locais de cada rotina), destacando o valor anterior e o novo (`anterior -> novo`) a cada alteração

### Exemplos Didáticos e Guia Integrado
- **Exemplos comentados** (do básico a `record` e cores CRT) com explicação passo a passo, conceitos abordados, dicas e desafios práticos
- **Guia & Docs** completo dentro da própria aplicação: explicação de todos os blocos, tipos, operadores, erros comuns e catálogo pesquisável com mais de 45 funções/procedimentos padrão do Pascal

### Arquivos e Área de Trabalho
- Botão **Limpar tudo** no topo (com suporte a desfazer via `Ctrl+Z`)
- Projetos `.pas_block`, download do `.pas`, abertura de arquivos `.pas` (convertidos em blocos) e **link de compartilhamento**
- Salvamento automático no navegador; arquivos `.pas_block` da versão antiga continuam sendo importados

---

## Desenvolvimento

Não há etapa de build: é HTML + CSS + JavaScript (módulos ES). Para rodar localmente, sirva a pasta com qualquer servidor estático:

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

Testes do compilador/interpretador, documentação e conversão blocos <-> código:

```bash
node tests/run.mjs
```

Estrutura:

```text
js/pascal/     lexer, parser, analisador semântico, interpretador
js/blocks/     definições dos blocos, editor visual, gerador de código, conversão código -> blocos
js/ui/         editor de código, console, realce de sintaxe, ícones SVG
js/examples.js exemplos prontos com guia didático
js/docs.js     documentação completa das funções, blocos e erros comuns
js/app.js      aplicação (modos, execução, arquivos, documentação, atalhos)
```

---

## Exemplo de Uso

O aluno pode construir visualmente um algoritmo como:

```pascal
program Area;
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
```

---

## Contexto Educacional

O **Pascal :: Blocks** foi concebido e aplicado em contextos de:

- Ensino Básico
- Cursos Técnicos
- Licenciatura em Computação
- Formação de professores

Sendo especialmente útil em cenários onde estudantes apresentam **dificuldades iniciais com linguagens textuais**.

---

## Tecnologias Utilizadas

- HTML5
- CSS3
- JavaScript (Vanilla, módulos ES, sem dependências)
- Ícones SVG inline (estilo Lucide)
- Arquitetura **100% client-side** (sem dependência de servidor)

---

## Licença

Este projeto é distribuído como **Recurso Educacional Aberto**, podendo ser utilizado, adaptado e redistribuído para fins educacionais.

> Recomenda-se manter os créditos ao autor e ao projeto original.

---

## Créditos

Projeto original e contribuidores:
- Diego Breskovit
- Arthur Willers (fork vibecodado)
