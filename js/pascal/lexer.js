// Analisador léxico (tokenizador) para Pascal.
import { PascalError } from './errors.js';

export const KEYWORDS = new Set([
  'and', 'array', 'begin', 'case', 'const', 'div', 'do', 'downto', 'else',
  'end', 'for', 'function', 'if', 'in', 'mod', 'not', 'of', 'or', 'procedure',
  'program', 'record', 'repeat', 'then', 'to', 'type', 'until', 'var', 'while',
  'xor', 'shl', 'shr', 'uses', 'with', 'goto', 'label', 'nil', 'set', 'file',
  'packed', 'forward',
]);

const TWO_CHAR_OPS = new Set([':=', '<>', '<=', '>=', '..', '+=', '-=', '*=', '/=']);
const ONE_CHAR_OPS = new Set([
  '+', '-', '*', '/', '=', '<', '>', '(', ')', '[', ']', ',', ';', ':', '.', '^', '@',
]);

function isIdStart(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}
function isIdChar(c) {
  return isIdStart(c) || (c >= '0' && c <= '9');
}
function isDigit(c) {
  return c >= '0' && c <= '9';
}

/**
 * Converte o código-fonte em uma lista de tokens.
 * Cada token: { t, v, line, col, pos, end }
 * t ∈ 'id' | 'kw' | 'int' | 'real' | 'str' | 'op' | 'eof'
 */
export function tokenize(src) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const n = src.length;

  const err = (msg, l = line, c = i - lineStart + 1, hint) => {
    throw new PascalError(msg, l, c, hint);
  };

  while (i < n) {
    const c = src[i];

    // Quebras de linha
    if (c === '\n') {
      i++;
      line++;
      lineStart = i;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f') {
      i++;
      continue;
    }

    // Comentários
    if (c === '{') {
      const sl = line;
      const sc = i - lineStart + 1;
      i++;
      while (i < n && src[i] !== '}') {
        if (src[i] === '\n') {
          line++;
          lineStart = i + 1;
        }
        i++;
      }
      if (i >= n) err('Comentário { ... } não foi fechado', sl, sc, "Feche o comentário com '}'.");
      i++;
      continue;
    }
    if (c === '(' && src[i + 1] === '*') {
      const sl = line;
      const sc = i - lineStart + 1;
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === ')')) {
        if (src[i] === '\n') {
          line++;
          lineStart = i + 1;
        }
        i++;
      }
      if (i >= n) err('Comentário (* ... *) não foi fechado', sl, sc);
      i += 2;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }

    const start = i;
    const col = i - lineStart + 1;
    const push = (t, v) => tokens.push({ t, v, line, col, pos: start, end: i });

    // Identificadores / palavras reservadas
    if (isIdStart(c)) {
      while (i < n && isIdChar(src[i])) i++;
      const word = src.slice(start, i);
      const lower = word.toLowerCase();
      if (KEYWORDS.has(lower)) push('kw', lower);
      else {
        tokens.push({ t: 'id', v: lower, raw: word, line, col, pos: start, end: i });
      }
      continue;
    }

    // Números
    if (isDigit(c)) {
      while (i < n && isDigit(src[i])) i++;
      let isReal = false;
      if (src[i] === '.' && isDigit(src[i + 1] || '')) {
        isReal = true;
        i++;
        while (i < n && isDigit(src[i])) i++;
      }
      if ((src[i] === 'e' || src[i] === 'E') &&
        (isDigit(src[i + 1] || '') ||
          ((src[i + 1] === '+' || src[i + 1] === '-') && isDigit(src[i + 2] || '')))) {
        isReal = true;
        i += 2;
        while (i < n && isDigit(src[i])) i++;
      }
      if (i < n && isIdStart(src[i])) {
        err(`Número inválido: '${src.slice(start, i + 1)}'`, line, col,
          'Identificadores não podem começar com dígitos.');
      }
      const text = src.slice(start, i);
      push(isReal ? 'real' : 'int', isReal ? parseFloat(text) : parseInt(text, 10));
      continue;
    }
    if (c === '$') {
      i++;
      while (i < n && /[0-9a-fA-F]/.test(src[i])) i++;
      if (i === start + 1) err("Número hexadecimal inválido após '$'");
      push('int', parseInt(src.slice(start + 1, i), 16));
      continue;
    }

    // Strings: 'abc', 'It''s', #65, 'a'#13#10'b'
    if (c === "'" || c === '#') {
      let value = '';
      while (i < n && (src[i] === "'" || src[i] === '#')) {
        if (src[i] === "'") {
          i++;
          for (;;) {
            if (i >= n || src[i] === '\n') {
              err('String não foi fechada (falta o apóstrofo final)', line, col,
                "Textos em Pascal ficam entre apóstrofos: 'assim'. Para escrever um apóstrofo dentro do texto use dois: 'It''s'.");
            }
            if (src[i] === "'") {
              if (src[i + 1] === "'") {
                value += "'";
                i += 2;
                continue;
              }
              i++;
              break;
            }
            value += src[i++];
          }
        } else {
          i++;
          const ds = i;
          if (src[i] === '$') {
            i++;
            while (i < n && /[0-9a-fA-F]/.test(src[i])) i++;
            value += String.fromCharCode(parseInt(src.slice(ds + 1, i), 16));
          } else {
            while (i < n && isDigit(src[i])) i++;
            if (i === ds) err("Código de caractere inválido após '#'");
            value += String.fromCharCode(parseInt(src.slice(ds, i), 10));
          }
        }
      }
      push('str', value);
      continue;
    }

    if (c === '"') {
      err('Use apóstrofos (\') para textos em Pascal, não aspas duplas (")', line, col,
        "Exemplo: writeln('Olá mundo');");
    }

    const two = src.substr(i, 2);
    if (TWO_CHAR_OPS.has(two)) {
      i += 2;
      push('op', two);
      continue;
    }
    if (ONE_CHAR_OPS.has(c)) {
      i++;
      push('op', c);
      continue;
    }

    err(`Caractere inesperado: '${c}'`);
  }

  tokens.push({ t: 'eof', v: '<fim>', line, col: i - lineStart + 1, pos: n, end: n });
  return tokens;
}

