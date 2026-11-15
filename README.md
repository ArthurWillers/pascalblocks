# Pascal :: Blocks 🧩💻

**Pascal :: Blocks** é um ambiente educacional baseado em **programação em blocos**, voltado ao ensino de **Algoritmos e Lógica de Programação** utilizando a **linguagem Pascal** como referência sintática e semântica real.

O projeto foi desenvolvido com foco **didático**, buscando reduzir as barreiras iniciais no aprendizado de programação, sem abrir mão do rigor conceitual exigido por linguagens textuais tradicionais.

---
## Para acessar:

🔗 **Link 1**  
https://pascalblocks.netlify.app/

🔗 **Link 2**  
https://uianes.github.io/pascalblocks/

---

## 🎯 Objetivos do Projeto

- Facilitar o ensino de **lógica de programação** para iniciantes  
- Aproximar estudantes da **sintaxe real do Pascal**, evitando abstrações artificiais  
- Permitir a transição gradual entre **programação visual** e **programação textual**
- Servir como **ferramenta pedagógica**, **objeto de pesquisa** e **recurso educacional aberto**

---

## ✨ Principais Funcionalidades

### 🧱 Programação em Blocos (estruturados)
- Blocos **aninhados**: `if`, `for`, `while`, `repeat`, `case`, `procedure` e `function` têm encaixes internos — não é preciso montar `begin`, `end` e `;` à mão, o código gerado é sempre válido
- Campos editáveis direto no bloco (sem janelas de `prompt`), com **validação em tempo real** e autocompletar de variáveis
- `writeln`/`write` com partes de **texto** e **valor**, incluindo formatação (`media:0:2`) — sem precisar brigar com apóstrofos
- Bloco **perguntar e ler** (`write` + `readln`), `inc`/`dec`, `case` com opções, sub-rotinas com parâmetros e variáveis locais, `break`/`continue`/`exit`, cores e tela (unit CRT), comentários e bloco de **código Pascal livre**
- Operadores e funções (`div`, `mod`, `and`, `sqrt`, `length`, `copy`...) inseridos com um clique no campo selecionado
- Arrastar e soltar (mouse ou toque), duplicar, copiar/colar, desfazer/refazer e navegação por teclado

### ⌨️ Editor de Código
- Aba **Código** para escrever Pascal livremente, com realce de sintaxe, números de linha e erros marcados enquanto se digita
- **Conversão nos dois sentidos**: blocos → código e código → blocos

### ⚙️ Compilador + Interpretador Pascal (100% no navegador)
- Analisador léxico, sintático e **semântico** (verificação de tipos) com mensagens e dicas em português
- Tipos: `integer`, `real`, `boolean`, `char`, `string`, arrays (matrizes, índices `char`, dinâmicos), `record`, enumerações, conjuntos (`in`)
- `procedure`/`function` com parâmetros por valor, `var` e `const`, recursão e rotinas aninhadas
- Saída formatada idêntica ao Free Pascal (`writeln(x)` real em notação científica, `x:0:2`, `TRUE/FALSE`)
- `readln`/`read` interativos no console, erros de execução amigáveis (divisão por zero, índice fora dos limites, entrada inválida...)
- Funções da unit CRT e SysUtils mais usadas (`clrscr`, `textcolor`, `delay`, `readkey`, `IntToStr`, `StrToInt`, `UpperCase`...)

### 👣 Passo a Passo e Depuração
- Executa uma linha/bloco por vez, destacando o bloco e a linha atuais
- Painel dividido **Console & Variáveis** simultâneos para acompanhar saída, entrada (`readln`) e memória ao mesmo tempo
- Tabela de **variáveis** (inclusive locais de cada rotina), destacando o valor anterior e o novo (`anterior → novo`) a cada alteração

### 📚 Exemplos Didáticos e Guia Integrado
- **Exemplos comentados** (do básico a `record` e cores CRT) com explicação passo a passo, conceitos abordados, dicas e desafios práticos
- **📖 Guia & Docs** completo dentro da própria aplicação: explicação de todos os blocos, tipos, operadores, erros comuns e catálogo pesquisável com mais de 45 funções/procedimentos padrão do Pascal

### 💾 Arquivos e Área de Trabalho
- Botão **🗑️ Limpar tudo** no topo (com suporte a desfazer via `Ctrl+Z`)
- Projetos `.pas_block`, download do `.pas`, abertura de arquivos `.pas` (convertidos em blocos) e **link de compartilhamento**
- Salvamento automático no navegador; arquivos `.pas_block` da versão antiga continuam sendo importados

---

## 🧑‍💻 Desenvolvimento

Não há etapa de build: é HTML + CSS + JavaScript (módulos ES). Para rodar localmente, sirva a pasta com qualquer servidor estático:

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

Testes do compilador/interpretador e da conversão blocos ↔ código:

```bash
node tests/run.mjs
```

Estrutura:

```
js/pascal/     lexer, parser, analisador semântico, interpretador
js/blocks/     definições dos blocos, editor visual, gerador de código, conversão código → blocos
js/ui/         editor de código, console, realce de sintaxe
js/examples.js exemplos prontos com guia didático
js/docs.js     documentação completa das funções, blocos e erros comuns
js/app.js      aplicação (modos, execução, arquivos, documentação, atalhos)
```

---

## 🧪 Exemplo de Uso

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
    writeln('Tem área ', ar);
  end
  else
    writeln('Não existe');
end.
```
---

## 📚 Produção Acadêmica e Divulgação

Este projeto **originou um artigo acadêmico** e já foi apresentado em eventos e espaços institucionais.

🔗 **Vídeo de apresentação do projeto**  
https://www.youtube.com/watch?app=desktop&v=kxUUM23Iq9Q

🔗 **Notícia institucional (IFFar – Campus Santo Augusto)**  
https://www.iffar.edu.br/noticias-sau/item/17275-iffar-%E2%80%93-campus-santo-augusto-%C3%A9-parceiro-na-realiza%C3%A7%C3%A3o-vi-senid

---

## 🏫 Contexto Educacional

O **Pascal :: Blocks** foi concebido e aplicado em contextos de:

- Ensino Básico
- Cursos Técnicos
- Licenciatura em Computação
- Formação de professores

Sendo especialmente útil em cenários onde estudantes apresentam **dificuldades iniciais com linguagens textuais**.

---

## 🛠️ Tecnologias Utilizadas

- HTML5
- CSS3
- JavaScript (Vanilla, módulos ES, sem dependências)
- Arquitetura **100% client-side** (sem dependência de servidor)

---

## 📄 Licença

Este projeto é distribuído como **Recurso Educacional Aberto**, podendo ser utilizado, adaptado e redistribuído para fins educacionais.

> Recomenda-se manter os créditos ao autor e ao projeto original.


---

## 🤝 Contribuições

Contribuições são bem-vindas!

Sugestões, melhorias pedagógicas, correções ou extensões do projeto podem ser feitas via **Issues** ou **Pull Requests**.

Contribuidores:
[Diego Breskovit](https://github.com/dbreskovit)
[Arthur Willers](https://github.com/ArthurWillers)
