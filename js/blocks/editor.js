// Editor visual de blocos: renderização, campos editáveis, seleção e arrastar-e-soltar.
import { BLOCKS, CAT_COLOR, PALETTE, CATEGORIES, TYPE_SUGGESTIONS } from './defs.js';
import {
  createBlock, cloneBlock, findBlock, removeBlock, walk, slotAccepts,
} from './model.js';
import { parseExpression, parseProgram, KEYWORDS } from '../pascal/index.js';

const INTERACTIVE = 'input, select, textarea, button, label, .part__kind';

function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

// ------------------------------------------------------------------ Validação de campos
function validateField(type, value) {
  const v = String(value ?? '').trim();
  try {
    switch (type) {
      case 'ident':
        if (!v) return 'Campo obrigatório';
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) {
          return /\s/.test(v) ? 'Nomes não podem ter espaços (use _ ou junte as palavras)' :
            /^[0-9]/.test(v) ? 'Nomes não podem começar com número' : 'Use apenas letras sem acento, números e _';
        }
        if (KEYWORDS.has(v.toLowerCase())) return `'${v}' é uma palavra reservada do Pascal`;
        return null;
      case 'idents': {
        if (!v) return 'Informe pelo menos um nome';
        for (const part of v.split(',')) {
          const e = validateField('ident', part);
          if (e) return e + (part.trim() ? ` ('${part.trim()}')` : '');
        }
        return null;
      }
      case 'expr':
        if (!v) return 'Campo obrigatório';
        parseExpression(v);
        return null;
      case 'lvalue': {
        if (!v) return 'Informe a variável';
        const e = parseExpression(v);
        if (!['id', 'index', 'field'].includes(e.kind)) return 'Aqui deve ir uma variável (ex: x, v[i], aluno.nome)';
        return null;
      }
      case 'lvalues': {
        if (!v) return null;
        const e = parseExpression('f(' + v + ')');
        for (const a of e.args) if (!['id', 'index', 'field'].includes(a.kind)) return 'Informe variáveis separadas por vírgula';
        return null;
      }
      case 'exprs':
        if (!v) return null;
        parseExpression('f(' + v + ')');
        return null;
      case 'labels':
        if (!v) return 'Informe o valor da opção';
        parseProgram('begin case x of ' + v + ': ; end end.');
        return null;
      case 'type':
        if (!v) return 'Informe o tipo';
        parseProgram('type T = ' + v + '; begin end.');
        return null;
      case 'params':
        if (!v) return null;
        parseProgram('procedure p(' + v + '); begin end; begin end.');
        return null;
      default:
        return null;
    }
  } catch (e) {
    return e.message + (e.hint ? ' — ' + e.hint : '');
  }
}

const FIELD_DATALIST = { lvalue: 'pb-dl-vars', type: 'pb-dl-types' };

export class BlockEditor {
  /**
   * @param {HTMLElement} ws  área de trabalho
   * @param {HTMLElement} palette  paleta lateral
   * @param {object} opts { onChange(structural), onSelect(id), toast(msg) }
   */
  constructor(ws, palette, opts = {}) {
    this.ws = ws;
    this.palette = palette;
    this.opts = opts;
    this.program = null;
    this.selected = null;
    this.clipboard = null;
    this.drag = null;
    this.lastFocusedInput = null;
    this.marks = new Map();
    this.runningId = null;
    this.buildPalette();
    this.buildDatalists();
    this.wire();
  }

  // ------------------------------------------------------------------ Paleta
  buildPalette() {
    const p = this.palette;
    p.innerHTML = '';
    for (const group of PALETTE) {
      const cat = CATEGORIES.find((c) => c.id === group.cat);
      const sec = h('section', 'pal__sec');
      const title = h('button', 'pal__title');
      title.type = 'button';
      title.innerHTML = `<span class="pal__dot" style="background:${cat.color}"></span>${cat.name}<span class="pal__chev">▾</span>`;
      title.addEventListener('click', () => sec.classList.toggle('pal__sec--closed'));
      sec.appendChild(title);
      const list = h('div', 'pal__list');
      group.items.forEach((item) => {
        const it = h('div', 'pal__item');
        it.style.setProperty('--c', cat.color);
        it.innerHTML = `<span class="pal__label"></span><span class="pal__desc"></span>`;
        it.querySelector('.pal__label').textContent = item.label;
        it.querySelector('.pal__desc').textContent = item.desc;
        it.title = (BLOCKS[item.type].tip || '') + '\n\nClique para adicionar ou arraste para a posição desejada.';
        it._pal = item;
        list.appendChild(it);
      });
      sec.appendChild(list);
      p.appendChild(sec);
    }
  }

  buildDatalists() {
    if (document.getElementById('pb-dl-vars')) return;
    for (const id of ['pb-dl-vars', 'pb-dl-types', 'pb-dl-procs']) {
      const dl = document.createElement('datalist');
      dl.id = id;
      document.body.appendChild(dl);
    }
  }

  updateDatalists() {
    if (!this.program) return;
    const vars = new Set();
    const types = new Set(TYPE_SUGGESTIONS);
    const procs = new Set();
    walk(this.program, (b) => {
      if (b.type === 'var') String(b.f.names || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => vars.add(n));
      if (b.type === 'typedecl' && b.f.name) types.add(b.f.name.trim());
      if (b.type === 'procedure' && b.f.name) procs.add(b.f.name.trim());
      if ((b.type === 'procedure' || b.type === 'function') && b.f.params) {
        String(b.f.params).split(';').forEach((grp) => {
          const names = grp.split(':')[0].replace(/\b(var|const)\b/gi, '');
          names.split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => vars.add(n));
        });
      }
      return true;
    });
    const fill = (id, set) => {
      const dl = document.getElementById(id);
      dl.innerHTML = '';
      for (const v of set) {
        const o = document.createElement('option');
        o.value = v;
        dl.appendChild(o);
      }
    };
    fill('pb-dl-vars', vars);
    fill('pb-dl-types', types);
    fill('pb-dl-procs', procs);
  }

  // ------------------------------------------------------------------ Renderização
  setProgram(p) {
    this.program = p;
    this.render();
  }

  render() {
    const scroll = this.ws.scrollTop;
    this.ws.innerHTML = '';
    this.ws.appendChild(this.renderProgram(this.program));
    this.ws.scrollTop = scroll;
    this.applyMarks();
    this.updateDatalists();
  }

  renderProgram(p) {
    const el = h('div', 'blk blk--program');
    el.dataset.id = p.id;
    const head = h('div', 'blk__row blk__head');
    head.appendChild(h('span', 'blk__kw', 'program'));
    head.appendChild(this.renderInput(p, { f: 'name', t: 'ident', ph: 'Nome' }));
    head.appendChild(h('span', 'blk__txt', ';'));
    const lab = h('label', 'blk__check');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!p.f.crt;
    cb.addEventListener('change', () => {
      p.f.crt = cb.checked;
      this.changed(true);
    });
    lab.appendChild(cb);
    lab.appendChild(h('span', 'blk__kw', 'uses crt;'));
    lab.title = 'A unit CRT oferece clrscr, textcolor, delay, readkey...';
    head.appendChild(lab);
    el.appendChild(head);
    el.appendChild(h('div', 'blk__section', 'Declarações — variáveis, constantes, procedimentos e funções'));
    el.appendChild(this.renderSlot(p, 'decls', 'decl', 'Arraste aqui blocos de var, const, procedure e function'));
    const b = h('div', 'blk__row');
    b.appendChild(h('span', 'blk__kw', 'begin'));
    b.appendChild(h('span', 'blk__hint', 'programa principal'));
    el.appendChild(b);
    el.appendChild(this.renderSlot(p, 'body', 'stmt', 'Arraste comandos para cá'));
    const e = h('div', 'blk__row');
    e.appendChild(h('span', 'blk__kw', 'end.'));
    el.appendChild(e);
    return el;
  }

  renderSlot(parent, name, accepts, emptyText) {
    const slot = h('div', 'blk__slot');
    slot.dataset.slot = name;
    slot.dataset.parent = parent.id;
    slot.dataset.accepts = accepts;
    const list = parent.s[name] || [];
    for (const child of list) slot.appendChild(this.renderBlock(child));
    if (!list.length) {
      slot.classList.add('blk__slot--empty');
      slot.appendChild(h('div', 'blk__empty', emptyText || (accepts === 'caseitem' ? 'Arraste opções do case para cá' : 'Arraste comandos para cá')));
    }
    return slot;
  }

  renderBlock(b) {
    const def = BLOCKS[b.type];
    const el = h('div', `blk blk--${b.type} blk--k-${def.kind}`);
    el.dataset.id = b.id;
    el.style.setProperty('--c', CAT_COLOR[def.cat] || '#64748b');
    if (this.selected === b.id) el.classList.add('blk--sel');
    let first = true;
    for (const row of def.rows) {
      if (row.slot) {
        if (row.label) el.appendChild(h('div', 'blk__section', row.label));
        el.appendChild(this.renderSlot(b, row.slot, row.accepts || 'stmt'));
        continue;
      }
      const r = h('div', 'blk__row' + (first ? ' blk__head' : ''));
      for (const item of row) {
        if (typeof item === 'string') {
          const isKw = /^[a-z;.{}]+$/i.test(item.replace(/[ :=]/g, '')) && !/^(perguntar|e ler em|código Pascal|declaração Pascal|resultado)/.test(item);
          r.appendChild(h('span', isKw ? 'blk__kw' : 'blk__txt', item));
        } else r.appendChild(this.renderField(b, item));
      }
      if (first) {
        if (b.type === 'function') r.appendChild(h('span', 'blk__hint', `resultado: ${b.f.name || 'Nome'} := valor`));
        const tools = h('span', 'blk__tools');
        const err = h('span', 'blk__badge');
        tools.appendChild(err);
        const dup = h('button', 'blk__tool', '⧉');
        dup.type = 'button';
        dup.title = 'Duplicar (Ctrl+D)';
        dup.dataset.act = 'dup';
        const del = h('button', 'blk__tool blk__tool--del', '✕');
        del.type = 'button';
        del.title = 'Excluir (Delete)';
        del.dataset.act = 'del';
        tools.appendChild(dup);
        tools.appendChild(del);
        r.appendChild(tools);
      }
      el.appendChild(r);
      first = false;
    }
    return el;
  }

  renderField(b, spec) {
    switch (spec.t) {
      case 'select': {
        const sel = h('select', 'fld fld--select');
        sel.dataset.f = spec.f;
        for (const o of spec.options) {
          const opt = document.createElement('option');
          opt.value = o;
          opt.textContent = o;
          sel.appendChild(opt);
        }
        sel.value = b.f[spec.f];
        sel.addEventListener('change', () => {
          b.f[spec.f] = sel.value;
          this.changed(false);
        });
        return sel;
      }
      case 'parts':
        return this.renderParts(b);
      case 'code': {
        const ta = h('textarea', 'fld fld--code');
        ta.value = b.f[spec.f] || '';
        ta.placeholder = spec.ph || '';
        ta.spellcheck = false;
        ta.rows = Math.max(2, ta.value.split('\n').length);
        ta.addEventListener('input', () => {
          b.f[spec.f] = ta.value;
          ta.rows = Math.max(2, ta.value.split('\n').length);
          this.changed(false);
        });
        ta.addEventListener('keydown', (ev) => {
          if (ev.key === 'Tab') {
            ev.preventDefault();
            ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
            ta.dispatchEvent(new Event('input'));
          }
        });
        return ta;
      }
      default:
        return this.renderInput(b, spec);
    }
  }

  renderInput(b, spec) {
    const inp = h('input', `fld fld--${spec.t}${spec.wide ? ' fld--wide' : ''}`);
    inp.type = 'text';
    inp.spellcheck = false;
    inp.autocomplete = 'off';
    inp.value = b.f[spec.f] ?? '';
    inp.placeholder = spec.ph || '';
    inp.dataset.f = spec.f;
    inp.dataset.t = spec.t;
    const dl =
      b.type === 'call' && spec.f === 'name'
        ? 'pb-dl-procs'
        : b.type === 'for' && spec.f === 'var'
          ? 'pb-dl-vars'
          : FIELD_DATALIST[spec.t];
    if (dl) inp.setAttribute('list', dl);
    const size = () => {
      const valLen = (inp.value || '').length;
      const phLen = (inp.placeholder || '').length;
      const len = Math.max(valLen || phLen, spec.t === 'text' ? 5 : 2);
      inp.style.width = `calc(${Math.min(len + 2, 68)}ch + 20px)`;
    };
    size();
    const validate = () => {
      const msg = validateField(spec.t, inp.value);
      inp.classList.toggle('fld--bad', !!msg);
      inp.title = msg || '';
    };
    validate();
    let tmr = null;
    inp.addEventListener('input', () => {
      b.f[spec.f] = inp.value;
      size();
      clearTimeout(tmr);
      tmr = setTimeout(validate, 300);
      this.changed(false);
    });
    inp.addEventListener('change', () => {
      validate();
      if (spec.f === 'name' || spec.t === 'idents' || spec.t === 'params') this.updateDatalists();
      if (b.type === 'function' && spec.f === 'name') {
        const hint = inp.closest('.blk__row').querySelector('.blk__hint');
        if (hint) hint.textContent = `resultado: ${inp.value || 'Nome'} := valor`;
      }
    });
    inp.addEventListener('focus', () => {
      if (['expr', 'exprs', 'labels'].includes(spec.t) || spec.t === 'lvalue') this.lastFocusedInput = inp;
    });
    return inp;
  }

  renderParts(b) {
    const wrap = h('span', 'parts');
    wrap.appendChild(h('span', 'blk__txt', b.f.parts.length ? '(' : ''));
    b.f.parts.forEach((p, i) => {
      if (i > 0) wrap.appendChild(h('span', 'parts__sep', ','));
      const chip = h('span', 'part part--' + p.k);
      const kind = h('button', 'part__kind', p.k === 'text' ? 'T' : 'x');
      kind.type = 'button';
      kind.title = p.k === 'text' ? 'Texto fixo (clique para trocar por valor/variável)' : 'Valor ou variável (clique para trocar por texto fixo)';
      kind.addEventListener('click', () => {
        p.k = p.k === 'text' ? 'expr' : 'text';
        if (p.k === 'expr') p.fmt = p.fmt || '';
        this.changed(true);
        this.render();
      });
      chip.appendChild(kind);
      const inp = h('input', 'fld part__in');
      inp.type = 'text';
      inp.spellcheck = false;
      inp.value = p.v ?? '';
      inp.placeholder = p.k === 'text' ? 'texto' : 'variável';
      if (p.k === 'expr') inp.setAttribute('list', 'pb-dl-vars');
      const size = () => {
        const valLen = (inp.value || '').length;
        const phLen = (inp.placeholder || '').length;
        const len = Math.max(valLen || phLen, 2);
        inp.style.width = `calc(${Math.min(len + 2, 68)}ch + 18px)`;
      };
      size();
      const validate = () => {
        const msg = p.k === 'expr' ? validateField('expr', inp.value) : null;
        inp.classList.toggle('fld--bad', !!msg);
        inp.title = msg || (p.k === 'text' ? 'Texto exibido exatamente como digitado (sem apóstrofos)' : 'Variável ou expressão');
      };
      validate();
      inp.addEventListener('input', () => {
        p.v = inp.value;
        size();
        validate();
        this.changed(false);
      });
      inp.addEventListener('focus', () => {
        if (p.k === 'expr') this.lastFocusedInput = inp;
      });
      if (p.k === 'text') {
        chip.insertBefore(h('span', 'part__q', '‘'), null);
        chip.appendChild(inp);
        chip.appendChild(h('span', 'part__q', '’'));
      } else {
        chip.appendChild(inp);
        const fmt = h('input', 'fld part__fmt');
        fmt.type = 'text';
        fmt.value = p.fmt || '';
        fmt.placeholder = ':fmt';
        fmt.title = 'Formatação opcional. Ex: 0:2 → 2 casas decimais; 5 → largura 5';
        fmt.addEventListener('input', () => {
          p.fmt = fmt.value.replace(/^:/, '');
          fmt.classList.toggle('part__fmt--on', !!p.fmt);
          this.changed(false);
        });
        fmt.classList.toggle('part__fmt--on', !!p.fmt);
        chip.appendChild(fmt);
      }
      const rm = h('button', 'part__rm', '×');
      rm.type = 'button';
      rm.title = 'Remover esta parte';
      rm.addEventListener('click', () => {
        b.f.parts.splice(i, 1);
        this.changed(true);
        this.render();
      });
      chip.appendChild(rm);
      wrap.appendChild(chip);
    });
    if (b.f.parts.length) wrap.appendChild(h('span', 'blk__txt', ')'));
    const add = h('span', 'parts__add');
    const addT = h('button', 'parts__btn', '+ texto');
    addT.type = 'button';
    addT.title = 'Adicionar um texto fixo';
    addT.addEventListener('click', () => this.addPart(b, 'text'));
    const addV = h('button', 'parts__btn', '+ valor');
    addV.type = 'button';
    addV.title = 'Adicionar uma variável ou expressão';
    addV.addEventListener('click', () => this.addPart(b, 'expr'));
    add.appendChild(addT);
    add.appendChild(addV);
    wrap.appendChild(add);
    return wrap;
  }

  addPart(b, k) {
    b.f.parts.push(k === 'text' ? { k, v: ' ' } : { k, v: '', fmt: '' });
    this.changed(true);
    this.render();
    const el = this.blockEl(b.id);
    if (el) {
      const ins = el.querySelectorAll('.part__in');
      const last = ins[ins.length - 1];
      if (last) {
        last.focus();
        last.select();
      }
    }
  }

  blockEl(id) {
    return this.ws.querySelector(`.blk[data-id="${id}"]`);
  }

  // ------------------------------------------------------------------ Marcações (erros / execução)
  setMarks(marks) {
    this.marks = marks; // Map id -> {cls, msgs[]}
    this.applyMarks();
  }

  applyMarks() {
    for (const el of this.ws.querySelectorAll('.blk--error, .blk--warn')) {
      el.classList.remove('blk--error', 'blk--warn');
      const badge = el.querySelector(':scope > .blk__head .blk__badge');
      if (badge) {
        badge.textContent = '';
        badge.title = '';
      }
    }
    for (const [id, m] of this.marks) {
      const el = this.blockEl(id);
      if (!el) continue;
      el.classList.add(m.cls === 'error' ? 'blk--error' : 'blk--warn');
      const badge = el.querySelector(':scope > .blk__head .blk__badge');
      if (badge) {
        badge.textContent = m.cls === 'error' ? '⛔' : '⚠️';
        badge.title = m.msgs.join('\n\n');
      }
    }
    if (this.runningId) this.setRunning(this.runningId);
  }

  setRunning(id, scroll = true) {
    for (const el of this.ws.querySelectorAll('.blk--running')) el.classList.remove('blk--running');
    this.runningId = id;
    if (!id) return;
    const el = this.blockEl(id);
    if (el) {
      el.classList.add('blk--running');
      if (scroll) this.scrollIntoView(el);
    }
  }

  scrollIntoView(el) {
    const r = el.getBoundingClientRect();
    const wr = this.ws.getBoundingClientRect();
    if (r.top < wr.top + 20 || r.top > wr.bottom - 60) {
      this.ws.scrollTop += r.top - wr.top - wr.height / 3;
    }
  }

  // ------------------------------------------------------------------ Seleção e ações
  select(id, notify = true) {
    this.selected = id;
    for (const el of this.ws.querySelectorAll('.blk--sel')) el.classList.remove('blk--sel');
    if (id) {
      const el = this.blockEl(id);
      if (el) el.classList.add('blk--sel');
    }
    if (notify && this.opts.onSelect) this.opts.onSelect(id);
  }

  deleteBlock(id) {
    if (!id || id === this.program.id) return;
    const f = findBlock(this.program, id);
    if (!f) return;
    // seleciona vizinho
    const list = f.parent.s[f.slot];
    removeBlock(this.program, id);
    const next = list[f.index] || list[f.index - 1];
    this.selected = next ? next.id : null;
    this.changed(true);
    this.render();
  }

  duplicateBlock(id) {
    const f = findBlock(this.program, id);
    if (!f || !f.parent) return;
    const c = cloneBlock(f.block);
    f.parent.s[f.slot].splice(f.index + 1, 0, c);
    this.selected = c.id;
    this.changed(true);
    this.render();
    this.flash(c.id);
  }

  flash(id) {
    const el = this.blockEl(id);
    if (!el) return;
    el.classList.add('blk--new');
    setTimeout(() => el.classList.remove('blk--new'), 700);
    this.scrollIntoView(el);
  }

  /** Insere um bloco novo (da paleta) no lugar mais adequado. */
  insertNew(block) {
    const kind = BLOCKS[block.type].kind;
    const sel = this.selected ? findBlock(this.program, this.selected) : null;
    let parent = null;
    let slot = null;
    let index = 0;
    if (sel && sel.parent) {
      const sk = BLOCKS[sel.block.type].kind;
      if (sk === kind && slotAccepts(sel.parent.type, sel.slot) === kind) {
        parent = sel.parent;
        slot = sel.slot;
        index = sel.index + 1;
      } else if (kind === 'stmt' && sk === 'caseitem') {
        parent = sel.block;
        slot = 'body';
        index = sel.block.s.body.length;
      } else if (kind === 'caseitem' && sel.block.type === 'case') {
        parent = sel.block;
        slot = 'items';
        index = sel.block.s.items.length;
      } else if (kind === 'stmt' && (sel.block.type === 'procedure' || sel.block.type === 'function')) {
        parent = sel.block;
        slot = 'body';
        index = sel.block.s.body.length;
      } else if (kind === 'decl' && (sel.block.type === 'procedure' || sel.block.type === 'function') && block.type !== 'procedure' && block.type !== 'function') {
        parent = sel.block;
        slot = 'locals';
        index = sel.block.s.locals.length;
      }
    }
    if (!parent) {
      if (kind === 'stmt') {
        parent = this.program;
        slot = 'body';
        index = this.program.s.body.length;
      } else if (kind === 'decl') {
        parent = this.program;
        slot = 'decls';
        const decls = this.program.s.decls;
        index = decls.length;
        if (block.type !== 'procedure' && block.type !== 'function') {
          const firstRoutine = decls.findIndex((d) => d.type === 'procedure' || d.type === 'function');
          if (firstRoutine >= 0) index = firstRoutine;
        }
      } else {
        // caseitem sem case selecionado: usa o último case do programa
        let lastCase = null;
        walk(this.program, (b) => {
          if (b.type === 'case') lastCase = b;
          return true;
        });
        if (!lastCase) {
          this.toast('Adicione primeiro um bloco "case ... of" para depois incluir opções.');
          return;
        }
        parent = lastCase;
        slot = 'items';
        index = lastCase.s.items.length;
      }
    }
    parent.s[slot].splice(index, 0, block);
    this.selected = block.id;
    this.changed(true);
    this.render();
    this.flash(block.id);
    const el = this.blockEl(block.id);
    const first = el && el.querySelector(':scope > .blk__head input.fld, :scope > .blk__row textarea');
    if (first && !['writeln'].includes(block.type)) {
      first.focus();
      first.select && first.select();
    }
  }

  newFromPalette(item) {
    const b = createBlock(item.type, item.fields);
    if (item.withItems || item.type === 'case') {
      const a = createBlock('caseitem', { labels: '1' });
      const c = createBlock('caseitem', { labels: '2' });
      a.s.body.push(createBlock('writeln', { parts: [{ k: 'text', v: 'Opção 1' }] }));
      c.s.body.push(createBlock('writeln', { parts: [{ k: 'text', v: 'Opção 2' }] }));
      b.s.items.push(a, c);
    }
    return b;
  }

  addFromPalette(item) {
    this.insertNew(this.newFromPalette(item));
  }

  toast(msg) {
    if (this.opts.toast) this.opts.toast(msg);
  }

  /** Insere um trecho de texto no último campo de expressão focado. */
  insertSnippet(snippet) {
    const inp = this.lastFocusedInput;
    if (!inp || !document.body.contains(inp)) {
      this.toast('Clique primeiro em um campo de um bloco (ex: a condição de um if) para inserir.');
      return;
    }
    let text = snippet;
    const caretOffset = text.indexOf('( )') >= 0 ? text.indexOf('( )') + 1 : text.indexOf('[ ]') >= 0 ? text.indexOf('[ ]') + 1 : text === "''" ? 1 : -1;
    text = text.replace('( )', '()').replace('[ ]', '[]').replace(/\( , , \)/, '(, , )').replace(/\( , \)/, '(, )');
    const s = inp.selectionStart ?? inp.value.length;
    const e = inp.selectionEnd ?? inp.value.length;
    const before = inp.value.slice(0, s);
    const after = inp.value.slice(e);
    const isWord = /^[a-z]/i.test(text) && !/\(/.test(text);
    const isOp = /^(div|mod|and|or|not|in|[+\-*/=<>]+)/.test(text);
    let pre = '';
    let post = '';
    if ((isOp || isWord) && before && !/\s$/.test(before)) pre = ' ';
    if ((isOp || isWord) && !/^\s/.test(after)) post = ' ';
    inp.value = before + pre + text + post + after;
    let caret = (before + pre).length + (caretOffset >= 0 ? caretOffset : text.length + post.length);
    if (/\(, ?/.test(text) && caretOffset < 0) caret = (before + pre).length + text.indexOf('(') + 1;
    inp.focus();
    inp.setSelectionRange(caret, caret);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }

  copy(id) {
    const f = findBlock(this.program, id);
    if (f && f.parent) {
      this.clipboard = JSON.parse(JSON.stringify(f.block));
      this.toast('Bloco copiado. Use Ctrl+V para colar.');
    }
  }

  paste() {
    if (!this.clipboard) return;
    this.insertNew(cloneBlock(this.clipboard));
  }

  changed(structural) {
    if (this.opts.onChange) this.opts.onChange(structural);
  }

  // ------------------------------------------------------------------ Eventos
  wire() {
    this.ws.addEventListener('pointerdown', (ev) => this.onPointerDown(ev, 'ws'));
    this.palette.addEventListener('pointerdown', (ev) => this.onPointerDown(ev, 'pal'));
    this.ws.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.blk__tool');
      if (btn) {
        const id = btn.closest('.blk').dataset.id;
        if (btn.dataset.act === 'del') this.deleteBlock(id);
        else if (btn.dataset.act === 'dup') this.duplicateBlock(id);
      }
    });
    this.ws.addEventListener('focusin', (ev) => {
      const blk = ev.target.closest('.blk');
      if (blk && blk.dataset.id !== this.selected) this.select(blk.dataset.id);
    });
    document.addEventListener('pointermove', (ev) => this.onPointerMove(ev));
    document.addEventListener('pointerup', (ev) => this.onPointerUp(ev));
    document.addEventListener('pointercancel', () => this.cancelDrag());
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && this.drag) this.cancelDrag();
    });
  }

  handleKey(ev) {
    // chamado pelo app quando o modo blocos está ativo e o foco não está em um campo
    const id = this.selected;
    const mod = ev.ctrlKey || ev.metaKey;
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && id && id !== this.program.id) {
      ev.preventDefault();
      this.deleteBlock(id);
      return true;
    }
    if (mod && ev.key.toLowerCase() === 'd' && id) {
      ev.preventDefault();
      this.duplicateBlock(id);
      return true;
    }
    if (mod && ev.key.toLowerCase() === 'c' && id) {
      this.copy(id);
      return true;
    }
    if (mod && ev.key.toLowerCase() === 'v' && this.clipboard) {
      ev.preventDefault();
      this.paste();
      return true;
    }
    if ((ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && id) {
      const all = [...this.ws.querySelectorAll('.blk:not(.blk--program)')];
      const i = all.findIndex((el) => el.dataset.id === id);
      const n = all[i + (ev.key === 'ArrowUp' ? -1 : 1)];
      if (n) {
        ev.preventDefault();
        this.select(n.dataset.id);
        this.scrollIntoView(n);
      }
      return true;
    }
    return false;
  }

  onPointerDown(ev, where) {
    if (ev.button !== 0) return;
    if (ev.target.closest(INTERACTIVE)) return;
    if (where === 'pal') {
      const it = ev.target.closest('.pal__item');
      if (!it) return;
      this.drag = { cand: true, x: ev.clientX, y: ev.clientY, pal: it._pal, srcEl: it };
      ev.preventDefault();
      return;
    }
    const blk = ev.target.closest('.blk');
    if (!blk) {
      this.select(null);
      return;
    }
    const id = blk.dataset.id;
    if (blk.classList.contains('blk--program')) {
      this.select(null);
      return;
    }
    this.select(id);
    this.drag = { cand: true, x: ev.clientX, y: ev.clientY, id, srcEl: blk };
    ev.preventDefault();
    // tira o foco de campos para que Delete funcione no bloco
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }

  onPointerMove(ev) {
    const d = this.drag;
    if (!d) return;
    if (d.cand) {
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 5) return;
      this.startDrag(ev);
    }
    if (!d.active) return;
    d.lastX = ev.clientX;
    d.lastY = ev.clientY;
    d.ghost.style.transform = `translate(${ev.clientX - d.offX}px, ${ev.clientY - d.offY}px) rotate(1.5deg)`;
    if (!d.raf) {
      d.raf = requestAnimationFrame(() => {
        d.raf = null;
        this.updateDropTarget(d.lastX, d.lastY);
      });
    }
  }

  startDrag(ev) {
    const d = this.drag;
    d.cand = false;
    d.active = true;
    let ghostEl;
    if (d.pal) {
      d.block = this.newFromPalette(d.pal);
      ghostEl = this.renderBlock(d.block);
      d.offX = 20;
      d.offY = 16;
    } else {
      const f = findBlock(this.program, d.id);
      d.block = f.block;
      ghostEl = d.srcEl.cloneNode(true);
      const r = d.srcEl.getBoundingClientRect();
      d.offX = Math.min(ev.clientX - r.left, 60);
      d.offY = Math.min(ev.clientY - r.top, 20);
      d.srcEl.classList.add('blk--dragsrc');
    }
    d.kind = BLOCKS[d.block.type].kind;
    const ghost = h('div', 'drag-ghost');
    ghost.appendChild(ghostEl);
    ghostEl.classList.remove('blk--sel', 'blk--error', 'blk--warn', 'blk--running');
    document.body.appendChild(ghost);
    d.ghost = ghost;
    d.indicator = h('div', 'drop-ind');
    document.body.classList.add('is-dragging');
    this.ws.classList.add('ws--drag-' + d.kind);
    d.scrollTimer = setInterval(() => this.autoScroll(), 30);
  }

  autoScroll() {
    const d = this.drag;
    if (!d || !d.active || d.lastY === undefined) return;
    const r = this.ws.getBoundingClientRect();
    if (d.lastX < r.left || d.lastX > r.right) return;
    const edge = 50;
    if (d.lastY < r.top + edge) this.ws.scrollTop -= Math.ceil((r.top + edge - d.lastY) / 4);
    else if (d.lastY > r.bottom - edge) this.ws.scrollTop += Math.ceil((d.lastY - (r.bottom - edge)) / 4);
  }

  /** Encontra o encaixe e a posição de soltura. */
  updateDropTarget(x, y) {
    const d = this.drag;
    d.target = null;
    d.overTrash = false;
    document.querySelectorAll('.trash--over').forEach((e) => e.classList.remove('trash--over'));
    const el = document.elementFromPoint(x, y);
    if (!el) return this.hideIndicator();
    const trash = el.closest('[data-trash], #palette');
    if (trash) {
      d.overTrash = true;
      if (trash.dataset.trash !== undefined) trash.classList.add('trash--over');
      this.palette.classList.toggle('trash--over', !d.pal);
      return this.hideIndicator();
    }
    this.palette.classList.remove('trash--over');
    if (!this.ws.contains(el)) return this.hideIndicator();

    const valid = (slot) => slot && slot.dataset.accepts === d.kind && !(d.srcEl && !d.pal && d.srcEl.contains(slot));
    let slot = el.closest('.blk__slot');
    while (slot && !valid(slot)) slot = slot.parentElement && slot.parentElement.closest('.blk__slot');
    if (!slot) {
      // escolhe o encaixe válido mais próximo
      let best = null;
      let bestDist = Infinity;
      for (const s of this.ws.querySelectorAll('.blk__slot')) {
        if (!valid(s)) continue;
        const r = s.getBoundingClientRect();
        const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
        const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        const dist = dy + dx * 0.3;
        if (dist < bestDist) {
          bestDist = dist;
          best = s;
        }
      }
      if (!best || bestDist > 120) return this.hideIndicator();
      slot = best;
    }
    const children = [...slot.children].filter((c) => c.classList.contains('blk') && !c.classList.contains('blk--dragsrc'));
    let index = children.length;
    for (let i = 0; i < children.length; i++) {
      const r = children[i].getBoundingClientRect();
      if (y < r.top + Math.min(r.height / 2, 18)) {
        index = i;
        break;
      }
    }
    d.target = { parentId: slot.dataset.parent, slot: slot.dataset.slot, index };
    const ref = children[index] || null;
    if (ref) slot.insertBefore(d.indicator, ref);
    else {
      const src = [...slot.children].reverse().find((c) => c.classList.contains('blk'));
      if (src && src.nextSibling) slot.insertBefore(d.indicator, src.nextSibling);
      else if (src) slot.appendChild(d.indicator);
      else slot.insertBefore(d.indicator, slot.firstChild);
    }
    slot.classList.add('blk__slot--target');
    if (this._lastSlot && this._lastSlot !== slot) this._lastSlot.classList.remove('blk__slot--target');
    this._lastSlot = slot;
    return null;
  }

  hideIndicator() {
    const d = this.drag;
    if (d && d.indicator && d.indicator.parentNode) d.indicator.remove();
    if (this._lastSlot) this._lastSlot.classList.remove('blk__slot--target');
    this._lastSlot = null;
  }

  onPointerUp(ev) {
    const d = this.drag;
    if (!d) return;
    if (d.cand) {
      // foi um clique
      this.drag = null;
      if (d.pal) this.insertNew(this.newFromPalette(d.pal));
      return;
    }
    if (d.raf) cancelAnimationFrame(d.raf);
    this.updateDropTarget(ev.clientX, ev.clientY);
    const target = d.target;
    const overTrash = d.overTrash;
    this.endDrag();
    if (overTrash) {
      if (!d.pal) this.deleteBlock(d.id);
      return;
    }
    if (!target) {
      this.render();
      return;
    }
    const parentF = findBlock(this.program, target.parentId);
    if (!parentF) return this.render();
    if (!d.pal) removeBlock(this.program, d.id);
    const list = parentF.block.s[target.slot];
    list.splice(Math.min(target.index, list.length), 0, d.block);
    this.selected = d.block.id;
    this.changed(true);
    this.render();
    this.flash(d.block.id);
  }

  endDrag() {
    const d = this.drag;
    if (!d) return;
    this.hideIndicator();
    if (d.ghost) d.ghost.remove();
    if (d.srcEl) d.srcEl.classList.remove('blk--dragsrc');
    clearInterval(d.scrollTimer);
    document.body.classList.remove('is-dragging');
    this.ws.classList.remove('ws--drag-stmt', 'ws--drag-decl', 'ws--drag-caseitem');
    this.palette.classList.remove('trash--over');
    document.querySelectorAll('.trash--over').forEach((e) => e.classList.remove('trash--over'));
    this.drag = null;
  }

  cancelDrag() {
    if (!this.drag) return;
    const active = this.drag.active;
    this.endDrag();
    if (active) this.render();
  }
}

