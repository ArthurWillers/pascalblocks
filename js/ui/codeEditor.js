// Editor de código simples com realce de sintaxe, números de linha e marcação de erros.
import { highlightLines, escapeHtml } from './highlight.js';

export class CodeEditor {
  constructor(el, { onChange, readOnly = false } = {}) {
    this.el = el;
    this.onChange = onChange;
    this.readOnly = readOnly;
    el.classList.add('pb-editor');
    el.innerHTML = `
      <div class="pb-editor__gutter" aria-hidden="true"></div>
      <div class="pb-editor__scroll">
        <pre class="pb-editor__hl" aria-hidden="true"></pre>
        <textarea class="pb-editor__ta" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"
          aria-label="Código Pascal"></textarea>
      </div>`;
    this.gutter = el.querySelector('.pb-editor__gutter');
    this.scrollEl = el.querySelector('.pb-editor__scroll');
    this.hl = el.querySelector('.pb-editor__hl');
    this.ta = el.querySelector('.pb-editor__ta');
    if (readOnly) this.ta.readOnly = true;
    this.marks = new Map(); // linha -> {cls, msg}
    this.activeLine = 0;
    this.selLines = new Set();
    this.ta.addEventListener('input', () => {
      this.render();
      if (this.onChange) this.onChange(this.ta.value);
    });
    this.ta.addEventListener('scroll', () => this.syncScroll());
    this.ta.addEventListener('keydown', (ev) => this.onKey(ev));
    this.render();
  }

  get value() {
    return this.ta.value;
  }

  set value(v) {
    this.ta.value = v;
    this.render();
  }

  syncScroll() {
    this.hl.style.transform = `translate(${-this.ta.scrollLeft}px, ${-this.ta.scrollTop}px)`;
    this.gutter.scrollTop = this.ta.scrollTop;
  }

  setMarks(marks) {
    this.marks = marks;
    this.render();
  }

  setActiveLine(line, scroll = true) {
    this.activeLine = line;
    this.render();
    if (line && scroll) this.scrollToLine(line);
  }

  setSelectedLines(lines) {
    this.selLines = new Set(lines);
    this.render();
    if (lines.length) this.scrollToLine(lines[0]);
  }

  scrollToLine(line) {
    const lh = parseFloat(getComputedStyle(this.ta).lineHeight) || 20;
    const top = (line - 1) * lh;
    const h = this.ta.clientHeight;
    if (top < this.ta.scrollTop + lh || top > this.ta.scrollTop + h - 2 * lh) {
      this.ta.scrollTop = Math.max(0, top - h / 3);
    }
    this.syncScroll();
  }

  goTo(line, col = 1) {
    const lines = this.ta.value.split('\n');
    let pos = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    pos += Math.max(0, col - 1);
    this.ta.focus();
    this.ta.setSelectionRange(pos, pos);
    this.scrollToLine(line);
  }

  render() {
    const lines = highlightLines(this.ta.value);
    let html = '';
    let gut = '';
    for (let i = 0; i < lines.length; i++) {
      const n = i + 1;
      const mark = this.marks.get(n);
      let cls = 'pb-line';
      if (mark) cls += ' pb-line--' + mark.cls;
      if (n === this.activeLine) cls += ' pb-line--active';
      if (this.selLines.has(n)) cls += ' pb-line--sel';
      html += `<div class="${cls}">${lines[i] || ' '}</div>`;
      const title = mark ? ` title="${escapeHtml(mark.msg)}"` : '';
      gut += `<div class="pb-gutter__n${mark ? ' pb-gutter__n--' + mark.cls : ''}${n === this.activeLine ? ' pb-gutter__n--active' : ''}"${title}>${n}</div>`;
    }
    this.hl.innerHTML = html + '<div class="pb-line"> </div>';
    this.gutter.innerHTML = gut + '<div class="pb-gutter__n"> </div>';
    this.syncScroll();
  }

  onKey(ev) {
    if (this.readOnly) return;
    const ta = this.ta;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    if (ev.key === 'Tab') {
      ev.preventDefault();
      const ls = value.lastIndexOf('\n', s - 1) + 1;
      if (s !== e || ev.shiftKey) {
        // indenta/desindenta várias linhas
        const le = value.indexOf('\n', e - 1) === -1 ? value.length : value.indexOf('\n', e - (e > s && value[e - 1] === '\n' ? 1 : 0));
        const block = value.slice(ls, le);
        const lines = block.split('\n');
        const changed = lines.map((l) => (ev.shiftKey ? l.replace(/^ {1,2}/, '') : '  ' + l)).join('\n');
        this.replace(ls, le, changed);
        ta.setSelectionRange(ls, ls + changed.length);
      } else {
        this.replace(s, e, '  ');
        ta.setSelectionRange(s + 2, s + 2);
      }
      this.changed();
    } else if (ev.key === 'Enter' && !ev.ctrlKey && !ev.metaKey) {
      ev.preventDefault();
      const ls = value.lastIndexOf('\n', s - 1) + 1;
      const line = value.slice(ls, s);
      let indent = line.match(/^\s*/)[0];
      if (/\b(begin|then|do|repeat|of|var|const|type|else|record)\s*$/i.test(line.replace(/\{[^}]*\}\s*$/, ''))) indent += '  ';
      const ins = '\n' + indent;
      this.replace(s, e, ins);
      ta.setSelectionRange(s + ins.length, s + ins.length);
      this.changed();
    } else if (ev.key === 'd' && (ev.ctrlKey || ev.metaKey) && false) {
      // reservado
    } else if (ev.key === '/' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      const ls = value.lastIndexOf('\n', s - 1) + 1;
      let le = value.indexOf('\n', e);
      if (le === -1) le = value.length;
      const lines = value.slice(ls, le).split('\n');
      const all = lines.every((l) => /^\s*\/\//.test(l) || !l.trim());
      const out = lines.map((l) => (all ? l.replace(/^(\s*)\/\/ ?/, '$1') : l.trim() ? l.replace(/^(\s*)/, '$1// ') : l)).join('\n');
      this.replace(ls, le, out);
      ta.setSelectionRange(ls, ls + out.length);
      this.changed();
    }
  }

  replace(a, b, text) {
    // usa execCommand para manter o desfazer nativo do navegador quando possível
    this.ta.setSelectionRange(a, b);
    let ok = false;
    try {
      ok = document.execCommand('insertText', false, text);
    } catch {
      ok = false;
    }
    if (!ok) this.ta.setRangeText(text, a, b, 'end');
  }

  changed() {
    this.render();
    if (this.onChange) this.onChange(this.ta.value);
  }
}
