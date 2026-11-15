// Realce de sintaxe Pascal → HTML.
import { KEYWORDS } from '../pascal/lexer.js';
import { BUILTIN_FUNCS, BUILTIN_PROCS } from '../pascal/analyzer.js';

const TYPES = new Set(['integer', 'real', 'string', 'char', 'boolean', 'longint', 'byte', 'word', 'double',
  'single', 'extended', 'int64', 'shortint', 'smallint', 'cardinal', 'text']);
const CONSTS = new Set(['true', 'false', 'maxint', 'nil']);

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const RE = /(\{[^}]*\}?|\(\*[\s\S]*?(?:\*\)|$)|\/\/[^\n]*)|('(?:[^'\n]|'')*'?|#\d+)|(\$[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(:=|<>|<=|>=|[+\-*/=<>])|([\s\S])/g;

export function highlight(src) {
  let out = '';
  RE.lastIndex = 0;
  let m;
  while ((m = RE.exec(src))) {
    const [tok, com, str, num, id, op] = m;
    if (com) out += `<span class="hl-com">${escapeHtml(tok)}</span>`;
    else if (str) out += `<span class="hl-str">${escapeHtml(tok)}</span>`;
    else if (num) out += `<span class="hl-num">${tok}</span>`;
    else if (id) {
      const l = id.toLowerCase();
      if (KEYWORDS.has(l)) out += `<span class="hl-kw">${id}</span>`;
      else if (TYPES.has(l)) out += `<span class="hl-type">${id}</span>`;
      else if (CONSTS.has(l)) out += `<span class="hl-num">${id}</span>`;
      else if (BUILTIN_PROCS.has(l) || BUILTIN_FUNCS.has(l) || l === 'crt' || l === 'break' || l === 'continue' || l === 'exit') {
        out += `<span class="hl-fn">${id}</span>`;
      } else out += id;
    } else if (op) out += `<span class="hl-op">${escapeHtml(tok)}</span>`;
    else out += escapeHtml(tok);
  }
  return out;
}

/** Realce linha a linha (cada linha em uma <div>) preservando comentários multilinha. */
export function highlightLines(src) {
  const html = highlight(src);
  // divide preservando spans abertos através das linhas
  const lines = [];
  let cur = '';
  const open = [];
  const re = /(<span class="[^"]+">)|(<\/span>)|(\n)|([^<\n]+|<)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) {
      open.push(m[1]);
      cur += m[1];
    } else if (m[2]) {
      open.pop();
      cur += m[2];
    } else if (m[3]) {
      cur += '</span>'.repeat(open.length);
      lines.push(cur);
      cur = open.join('');
    } else cur += m[4];
  }
  lines.push(cur);
  return lines;
}

