// Terminal (console) interativo: saída colorida e leitura inline (readln / readkey).
import { CRT_COLORS } from '../pascal/index.js';

const MAX_NODES = 4000;

export class Terminal {
  constructor(el) {
    this.el = el;
    this.el.classList.add('pb-term');
    this.el.tabIndex = 0;
    this.out = document.createElement('div');
    this.out.className = 'pb-term__out';
    this.el.appendChild(this.out);
    this.pending = null;
    this.keyPending = null;
    this.lastSpan = null;
    this.lastKey = '';
    this.el.addEventListener('click', () => {
      if (this.pending && this.pending.input) this.pending.input.focus();
      else this.el.focus();
    });
    this.el.addEventListener('keydown', (ev) => {
      if (!this.keyPending) return;
      let ch = ev.key;
      if (ch === 'Enter') ch = '\r';
      else if (ch === 'Escape') ch = '\x1b';
      else if (ch === 'Backspace') ch = '\b';
      else if (ch === 'Tab') ch = '\t';
      else if (ch.length !== 1) return;
      ev.preventDefault();
      const r = this.keyPending;
      this.keyPending = null;
      this.el.classList.remove('pb-term--waitkey');
      r(ch);
    });
  }

  clear(bg = 0) {
    this.out.innerHTML = '';
    this.lastSpan = null;
    this.el.style.setProperty('--term-bg', bg ? CRT_COLORS[bg] : '');
  }

  scroll() {
    this.el.scrollTop = this.el.scrollHeight;
  }

  write(text, fg = 7, bg = 0) {
    const key = fg + ':' + bg;
    if (this.lastSpan && this.lastKey === key && this.lastSpan.parentNode === this.out) {
      this.lastSpan.textContent += text;
    } else {
      const span = document.createElement('span');
      if (fg !== 7) span.style.color = CRT_COLORS[fg];
      if (bg !== 0) span.style.background = CRT_COLORS[bg];
      span.textContent = text;
      this.out.appendChild(span);
      this.lastSpan = span;
      this.lastKey = key;
      if (this.out.childNodes.length > MAX_NODES) this.out.removeChild(this.out.firstChild);
    }
    this.scroll();
  }

  /** Mensagem do sistema (não faz parte da saída do programa). */
  system(text, cls = 'info') {
    if (this.out.lastChild && !/\n$/.test(this.out.lastChild.textContent || '')) {
      this.out.appendChild(document.createTextNode('\n'));
    }
    const div = document.createElement('div');
    div.className = 'pb-term__sys pb-term__sys--' + cls;
    if (text instanceof Node) div.appendChild(text);
    else div.textContent = text;
    this.out.appendChild(div);
    this.lastSpan = null;
    this.scroll();
    return div;
  }

  readLine() {
    return new Promise((resolve) => {
      const wrap = document.createElement('span');
      wrap.className = 'pb-term__inwrap';
      const input = document.createElement('input');
      input.className = 'pb-term__input';
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('spellcheck', 'false');
      input.setAttribute('aria-label', 'Entrada do programa');
      wrap.appendChild(input);
      this.out.appendChild(wrap);
      this.lastSpan = null;
      this.el.classList.add('pb-term--waiting');
      const finish = (value, echo = true) => {
        wrap.remove();
        this.el.classList.remove('pb-term--waiting');
        this.pending = null;
        if (echo) {
          const span = document.createElement('span');
          span.className = 'pb-term__echo';
          span.textContent = value + '\n';
          this.out.appendChild(span);
          this.lastSpan = null;
        }
        this.scroll();
        resolve(value);
      };
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          finish(input.value);
        }
        ev.stopPropagation();
      });
      this.pending = { input, finish };
      this.scroll();
      setTimeout(() => input.focus({ preventScroll: true }), 0);
    });
  }

  readKey() {
    return new Promise((resolve) => {
      this.keyPending = resolve;
      this.el.classList.add('pb-term--waitkey');
      this.el.focus({ preventScroll: true });
    });
  }

  /** Cancela leituras pendentes (ao parar o programa). */
  cancel() {
    if (this.pending) this.pending.finish('', false);
    if (this.keyPending) {
      const r = this.keyPending;
      this.keyPending = null;
      this.el.classList.remove('pb-term--waitkey');
      r('');
    }
  }

  get text() {
    return this.out.textContent;
  }
}

