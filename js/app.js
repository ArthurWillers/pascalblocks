// Aplicação principal: liga blocos, editor de código, console, variáveis, exemplos didáticos e documentação.
import { compile, Interpreter, PascalError, PascalRuntimeError, StopSignal } from './pascal/index.js';
import { BlockEditor } from './blocks/editor.js';
import { createProgram, createBlock, normalize, findBlock } from './blocks/model.js';
import { generate } from './blocks/codegen.js';
import { codeToBlocks } from './blocks/fromAst.js';
import { SNIPPETS, BLOCKS, CAT_COLOR } from './blocks/defs.js';
import { CodeEditor } from './ui/codeEditor.js';
import { Terminal } from './ui/terminal.js';
import { escapeHtml } from './ui/highlight.js';
import { icon } from './ui/icons.js';
import { EXAMPLES } from './examples.js';
import { STDLIB_DOCS, BLOCK_DOCS, COMMON_ERRORS_DOC, CRT_COLORS_DOC } from './docs.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'pascalblocks:v2';

// ------------------------------------------------------------------ Estado
const state = {
  mode: 'blocks',
  program: null,
  gen: { code: '', map: [] },
  editorSynced: true, // editor contém exatamente o código gerado pelos blocos
  running: null, // { interp, step }
  lastCheck: null,
  lastSnapshots: null,
  lastSnapNote: '',
  activeExample: null,
  guideCollapsed: false,
  outView: 'split', // 'split' | 'console' | 'vars' | 'problems'
};

const terminal = new Terminal($('terminal'));
const preview = new CodeEditor($('preview'), { readOnly: true });
const editor = new CodeEditor($('codeEditor'), {
  onChange: () => {
    state.editorSynced = false;
    scheduleCheck();
    scheduleSave();
    updateBanner();
  },
});

const blocks = new BlockEditor($('workspace'), $('palette'), {
  onChange: (structural) => {
    regenerate();
    if (structural) pushHistory();
    else scheduleHistory();
    scheduleCheck();
    scheduleSave();
  },
  onSelect: (id) => highlightPreviewFor(id),
  toast,
});

// ------------------------------------------------------------------ Utilidades de UI
let toastTimer = null;
function toast(msg, kind = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast toast--on ' + (kind ? 'toast--' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 3200);
}

function debounce(fn, ms) {
  let t = null;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function download(name, content, type = 'text/plain') {
  const blob = new Blob([content], { type: type + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// ------------------------------------------------------------------ Código / blocos
function regenerate() {
  state.gen = generate(state.program);
  preview.value = state.gen.code;
  if (state.editorSynced) editor.value = state.gen.code;
}

function currentSource() {
  return state.mode === 'blocks' ? state.gen.code : editor.value;
}

function programName() {
  const m = currentSource().match(/^\s*program\s+([A-Za-z_]\w*)/im);
  return m ? m[1] : 'programa';
}

function blockForLine(line) {
  const map = state.gen.map;
  for (let i = Math.min(line, map.length) - 1; i >= 0; i--) if (map[i]) return map[i];
  return null;
}

function linesForBlock(id) {
  const out = [];
  state.gen.map.forEach((b, i) => {
    if (b === id) out.push(i + 1);
  });
  return out;
}

function highlightPreviewFor(id) {
  preview.setSelectedLines(id ? linesForBlock(id) : []);
}

function setMode(mode) {
  if (state.running) stopRun();
  state.mode = mode;
  $('main').dataset.mode = mode;
  $('tabBlocks').classList.toggle('tabs__btn--on', mode === 'blocks');
  $('tabCode').classList.toggle('tabs__btn--on', mode === 'code');
  $('tabBlocks').setAttribute('aria-selected', mode === 'blocks');
  $('tabCode').setAttribute('aria-selected', mode === 'code');
  if (mode === 'code') {
    if (state.editorSynced || !editor.value.trim()) {
      editor.value = state.gen.code;
      state.editorSynced = true;
    }
    setTimeout(() => editor.ta.focus(), 0);
  }
  updateBanner();
  runCheck();
  scheduleSave();
}

function updateBanner() {
  const b = $('banner');
  const differs = !state.editorSynced && editor.value.trim() && editor.value !== state.gen.code;
  if (state.mode === 'code' && differs) {
    b.hidden = false;
    b.innerHTML = '';
    b.append('O código foi editado à mão e não corresponde mais aos blocos. ');
    const btn = document.createElement('button');
    btn.className = 'btn btn--small';
    btn.innerHTML = icon('undo', 13) + ' Recarregar código dos blocos';
    btn.onclick = () => {
      if (!confirm('Descartar as alterações feitas no código e recarregar a partir dos blocos?')) return;
      editor.value = state.gen.code;
      state.editorSynced = true;
      updateBanner();
      runCheck();
    };
    b.appendChild(btn);
  } else if (state.mode === 'blocks' && differs) {
    b.hidden = false;
    b.innerHTML = '';
    b.append('Há um código editado à mão na aba Código que ainda não foi convertido em blocos. ');
    const btn = document.createElement('button');
    btn.className = 'btn btn--small';
    btn.innerHTML = icon('puzzle', 13) + ' Converter código em blocos';
    btn.onclick = () => convertCodeToBlocks();
    b.appendChild(btn);
  } else b.hidden = true;
}

function setProgram(p, { history = true } = {}) {
  state.program = p;
  blocks.selected = null;
  blocks.setProgram(p);
  regenerate();
  if (history) pushHistory();
  runCheck();
  scheduleSave();
}

function convertCodeToBlocks(src = editor.value, { silent = false } = {}) {
  let p;
  try {
    p = codeToBlocks(src);
  } catch (e) {
    if (e instanceof PascalError) {
      if (!silent) {
        toast(`Não foi possível converter: erro na linha ${e.line}: ${e.message}`, 'error');
        setMode('code');
        runCheck();
        showTab('problems');
        editor.goTo(e.line, e.col);
      }
      return false;
    }
    throw e;
  }
  setProgram(p);
  state.editorSynced = true;
  editor.value = state.gen.code;
  updateBanner();
  if (!silent) {
    setMode('blocks');
    toast('Código convertido em blocos.', 'ok');
  }
  return true;
}

// ------------------------------------------------------------------ Histórico (desfazer / refazer)
const history = { stack: [], index: -1 };
function pushHistory() {
  const snap = JSON.stringify(state.program);
  if (history.stack[history.index] === snap) return;
  history.stack = history.stack.slice(0, history.index + 1);
  history.stack.push(snap);
  if (history.stack.length > 100) history.stack.shift();
  history.index = history.stack.length - 1;
  updateUndo();
}
const scheduleHistory = debounce(pushHistory, 600);

function restore(idx) {
  history.index = idx;
  state.program = JSON.parse(history.stack[idx]);
  blocks.setProgram(state.program);
  regenerate();
  runCheck();
  scheduleSave();
  updateUndo();
}
function undo() {
  if (history.index > 0) restore(history.index - 1);
}
function redo() {
  if (history.index < history.stack.length - 1) restore(history.index + 1);
}
function updateUndo() {
  $('btnUndo').disabled = history.index <= 0;
  $('btnRedo').disabled = history.index >= history.stack.length - 1;
}

// ------------------------------------------------------------------ Verificação contínua
const scheduleCheck = debounce(() => runCheck(), 350);

function runCheck() {
  if (state.running) return;
  const src = currentSource();
  const res = compile(src);
  state.lastCheck = res;
  renderProblems(res);
  // Atualiza visualização estática de variáveis declaradas caso ainda não tenha executado
  if (!state.lastSnapshots) renderVars(null);
  if (state.mode === 'blocks') {
    const marks = new Map();
    const add = (line, cls, msg) => {
      const id = blockForLine(line);
      if (!id) return;
      const m = marks.get(id) || { cls, msgs: [] };
      if (cls === 'error') m.cls = 'error';
      m.msgs.push(msg);
      marks.set(id, m);
    };
    res.errors.forEach((e) => add(e.line, 'error', e.message + (e.hint ? '\nDica: ' + e.hint : '')));
    res.warnings.forEach((w) => add(w.line, 'warn', w.message + (w.hint ? '\nDica: ' + w.hint : '')));
    blocks.setMarks(marks);
    const pm = new Map();
    res.errors.forEach((e) => pm.set(e.line, { cls: 'error', msg: e.message }));
    preview.setMarks(pm);
  } else {
    const pm = new Map();
    res.warnings.forEach((w) => pm.set(w.line, { cls: 'warn', msg: w.message }));
    res.errors.forEach((e) => pm.set(e.line, { cls: 'error', msg: e.message + (e.hint ? ' — ' + e.hint : '') }));
    editor.setMarks(pm);
  }
  const st = $('status');
  if (res.errors.length) {
    st.className = 'status status--error';
    st.innerHTML = `${icon('error', 14)} ${res.errors.length} erro${res.errors.length > 1 ? 's' : ''}`;
  } else if (res.warnings.length) {
    st.className = 'status status--warn';
    st.innerHTML = `${icon('alert', 14)} ${res.warnings.length} aviso${res.warnings.length > 1 ? 's' : ''}`;
  } else {
    st.className = 'status status--ok';
    st.innerHTML = `${icon('checkCircle', 14)} Sem erros`;
  }
  return res;
}

function renderProblems(res) {
  const el = $('problems');
  el.innerHTML = '';
  const n = res.errors.length + res.warnings.length;
  $('probCount').textContent = n ? String(n) : '';
  $('probCount').className = 'count' + (res.errors.length ? ' count--error' : n ? ' count--warn' : '');
  if (!n) {
    el.innerHTML = `<div class="problems__ok">${icon('checkCircle', 16)} Nenhum problema encontrado. O programa está pronto para executar.</div>`;
    return;
  }
  const item = (p, cls) => {
    const div = document.createElement('button');
    div.className = 'prob prob--' + cls;
    div.innerHTML = `<span class="prob__icon">${icon(cls === 'error' ? 'error' : 'alert', 15)}</span>
      <span class="prob__line">linha ${p.line}</span>
      <span class="prob__msg">${escapeHtml(p.message)}${p.hint ? `<span class="prob__hint">${icon('lightbulb', 13)} ${escapeHtml(p.hint)}</span>` : ''}</span>`;
    div.onclick = () => goToLine(p.line, p.col);
    el.appendChild(div);
  };
  res.errors.forEach((e) => item(e, 'error'));
  res.warnings.forEach((w) => item(w, 'warn'));
}

function goToLine(line, col) {
  if (state.mode === 'code') editor.goTo(line, col || 1);
  else {
    const id = blockForLine(line);
    if (id) {
      blocks.select(id);
      const el = blocks.blockEl(id);
      if (el) {
        blocks.scrollIntoView(el);
        el.classList.add('blk--new');
        setTimeout(() => el.classList.remove('blk--new'), 700);
      }
    }
    preview.setSelectedLines([line]);
  }
}

// ------------------------------------------------------------------ Painéis (Console + Variáveis simultâneos)
function showTab(tab) {
  state.outView = tab;
  document.querySelectorAll('.ptabs__btn').forEach((b) => b.classList.toggle('ptabs__btn--on', b.dataset.tab === tab));
  $('outBody').dataset.view = tab;
}
document.querySelectorAll('.ptabs__btn').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

function ensureConsoleVisible() {
  if (state.outView !== 'split' && state.outView !== 'console') {
    showTab('split');
  }
}

function extractDeclaredVars() {
  const vars = [];
  if (state.mode === 'blocks' && state.program) {
    for (const b of state.program.s.decls || []) {
      if (b.type === 'var') {
        const type = String(b.f.type || 'integer').trim();
        String(b.f.names || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((name) => vars.push({ name, type }));
      }
    }
  } else if (state.lastCheck && state.lastCheck.ast && state.lastCheck.ast.block) {
    for (const d of state.lastCheck.ast.block.vars || []) {
      const type = d.type ? d.type.name || d.type.kind || '' : '';
      for (const name of d.names || []) vars.push({ name, type });
    }
  }
  return vars;
}

function renderVars(scopes, note = '') {
  const el = $('vars');
  const hint = $('varsStatusHint');
  state.lastSnapshots = scopes;
  state.lastSnapNote = note;
  if (!scopes) {
    const decls = extractDeclaredVars();
    if (hint) hint.textContent = decls.length ? `${decls.length} declarada(s) · aguardando execução` : 'nenhuma variável declarada';
    if (!decls.length) {
      el.innerHTML =
        '<div class="vars__empty">Nenhuma variável declarada ainda.<br><small>Adicione um bloco <code>var</code> ou clique em <b>Passo a passo</b> para inspecionar a memória.</small></div>';
      return;
    }
    let html = '<div class="vars__note">Variáveis declaradas (clique em <b>Executar</b> ou <b>Passo a passo</b> para ver os valores mudando):</div>';
    html += '<table class="vars__tbl"><tbody>';
    for (const v of decls) {
      html += `<tr><td class="vars__name">${escapeHtml(v.name)}</td><td class="vars__type">${escapeHtml(v.type)}</td><td class="vars__val vars__val--uninit">— (não iniciado)</td></tr>`;
    }
    html += '</tbody></table>';
    el.innerHTML = html;
    return;
  }
  if (hint) hint.textContent = note || (state.running ? 'em execução (tempo real)' : 'valores finais');
  let html = note ? `<div class="vars__note">${escapeHtml(note)}</div>` : '';
  scopes.forEach((s, i) => {
    if (!s.vars.length) return;
    html += `<div class="vars__scope">${i === 0 && scopes.length > 1 ? icon('gitBranch', 13) + ' ' : ''}${escapeHtml(s.name === 'programa' ? 'Variáveis do programa' : s.name)}</div>`;
    html += '<table class="vars__tbl"><tbody>';
    for (const v of s.vars) {
      const prev = state.prevVars && state.prevVars.get(s.name + '.' + v.name);
      const changed = prev !== undefined && prev !== v.value;
      const diffHtml = changed
        ? `<span class="vars__prev" title="Valor anterior">${escapeHtml(prev)}</span><span class="vars__arrow">→</span>`
        : '';
      html += `<tr class="${changed ? 'vars__chg' : ''}"><td class="vars__name">${escapeHtml(v.name)}</td><td class="vars__type">${escapeHtml(v.type)}</td><td class="vars__val">${diffHtml}${escapeHtml(v.value)}</td></tr>`;
    }
    html += '</tbody></table>';
  });
  if (!scopes.some((s) => s.vars.length)) html += '<div class="vars__empty">O programa não tem variáveis declaradas.</div>';
  el.innerHTML = html;
  state.prevVars = new Map();
  scopes.forEach((s) => s.vars.forEach((v) => state.prevVars.set(s.name + '.' + v.name, v.value)));
}

// ------------------------------------------------------------------ Guia Didático dos Exemplos
function renderExampleGuide() {
  const box = $('exampleGuide');
  const ex = state.activeExample;
  if (!ex) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.classList.toggle('ex-guide--collapsed', !!state.guideCollapsed);
  const tagsHtml = (ex.concepts || []).map((c) => `<span class="ex-guide__tag">${escapeHtml(c)}</span>`).join('');
  const stepsHtml = (ex.steps || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('');
  box.innerHTML = `
    <div class="ex-guide__head">
      <span class="ex-guide__badge">${escapeHtml(ex.level)}</span>
      <span class="ex-guide__title">${icon('bookOpen', 15)} Exemplo: ${escapeHtml(ex.title)}</span>
      <div class="ex-guide__tags">${tagsHtml}</div>
      <div class="ex-guide__actions">
        <button type="button" class="btn btn--small" data-ex-act="step" title="Executar este exemplo passo a passo vendo Console e Variáveis">${icon('step', 13)} Testar Passo a passo</button>
        <button type="button" class="btn btn--small btn--ghost" data-ex-act="toggle">${state.guideCollapsed ? icon('chevronDown', 13) + ' Mostrar explicação' : icon('chevronUp', 13) + ' Recolher'}</button>
        <button type="button" class="btn btn--small btn--ghost" data-ex-act="close" title="Fechar explicação">${icon('x', 13)}</button>
      </div>
    </div>
    <div class="ex-guide__body">
      <div>
        <p class="ex-guide__summary">${escapeHtml(ex.summary || '')}</p>
        ${stepsHtml ? `<strong>Como funciona passo a passo:</strong><ol class="ex-guide__steps">${stepsHtml}</ol>` : ''}
      </div>
      <div class="ex-guide__side">
        ${ex.tip ? `<div class="ex-guide__box ex-guide__box--tip">${icon('lightbulb', 14)} <b>Dica do Pascal:</b> ${escapeHtml(ex.tip)}</div>` : ''}
        ${ex.challenge ? `<div class="ex-guide__box ex-guide__box--chal">${icon('rocket', 14)} <b>Desafio para você:</b> ${escapeHtml(ex.challenge)}</div>` : ''}
      </div>
    </div>
  `;
}

$('exampleGuide').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-ex-act]');
  if (!btn) return;
  const act = btn.dataset.exAct;
  if (act === 'toggle') {
    state.guideCollapsed = !state.guideCollapsed;
    renderExampleGuide();
  } else if (act === 'close') {
    state.activeExample = null;
    renderExampleGuide();
  } else if (act === 'step') {
    run(true);
  }
});

// ------------------------------------------------------------------ Execução
const io = {
  write: (t, fg, bg) => terminal.write(t, fg, bg),
  clear: (bg) => terminal.clear(bg),
  readLine: () => {
    ensureConsoleVisible();
    return terminal.readLine();
  },
  readKey: () => {
    ensureConsoleVisible();
    return terminal.readKey();
  },
};

function speedMs() {
  const v = Number($('dbgSpeed').value);
  return Math.round(1500 * Math.pow(1 - v / 100, 2)) + 30;
}

function setRunningLine(line) {
  if (state.mode === 'blocks') {
    blocks.setRunning(line ? blockForLine(line) : null);
    preview.setActiveLine(line || 0);
  } else editor.setActiveLine(line || 0);
}

function updateRunUI() {
  const r = state.running;
  $('btnRun').hidden = !!r;
  $('btnStep').hidden = !!r && !r.step;
  $('btnStop').hidden = !r;
  $('dbg').hidden = !(r && r.step);
  $('btnStep').disabled = !!r;
  document.body.classList.toggle('is-running', !!r);
  $('dbgPlay').innerHTML = r && r.auto ? `${icon('pause', 13)} Pausar` : `${icon('play', 13)} Auto`;
}

async function run(step = false) {
  if (state.running) {
    if (state.running.step) stepNext();
    return;
  }
  const res = runCheck();
  if (!res.ok) {
    ensureConsoleVisible();
    terminal.clear();
    terminal.system('O programa tem erros e não pode ser executado:', 'error');
    for (const e of res.errors.slice(0, 8)) {
      const div = terminal.system('', 'errline');
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = `Linha ${e.line}: `;
      a.onclick = (ev) => {
        ev.preventDefault();
        goToLine(e.line, e.col);
      };
      div.appendChild(a);
      div.append(e.message);
      if (e.hint) {
        const hint = document.createElement('div');
        hint.className = 'pb-term__hint';
        hint.textContent = 'Dica: ' + e.hint;
        div.appendChild(hint);
      }
    }
    return;
  }
  terminal.clear();
  // Sempre garante que Console + Variáveis estejam visíveis no modo split (ou mantém se já estiver em split)
  if (step || state.outView === 'problems') showTab('split');
  else ensureConsoleVisible();

  state.prevVars = null;
  renderVars(null);
  const r = { step, auto: false, resolve: null, interp: null };
  const stepHook = async (line, interp) => {
    setRunningLine(line);
    renderVars(interp.snapshot(), `Linha ${line} (próximo passo)`);
    if (r.auto) {
      await new Promise((ok) => {
        r.resolve = ok;
        r.timer = setTimeout(ok, speedMs());
      });
    } else {
      await new Promise((ok) => (r.resolve = ok));
    }
    r.resolve = null;
  };
  const interp = new Interpreter(res.ast, io, { onStep: step ? stepHook : null });
  r.interp = interp;
  state.running = r;
  updateRunUI();
  if (step) {
    terminal.system('Modo passo a passo: use Próximo (F10) para avançar e acompanhe o Console e as Variáveis ao mesmo tempo.', 'info');
  }
  const t0 = performance.now();
  const slowTimer = setTimeout(() => {
    if (state.running === r && !r.step && !terminal.pending && !terminal.keyPending) {
      terminal.system('O programa está executando há algum tempo. Se estiver em um laço infinito, clique em Parar (Esc).', 'warn');
    }
  }, 5000);
  try {
    const out = await interp.run();
    const secs = ((performance.now() - t0) / 1000).toFixed(2);
    terminal.system(out.halted ? 'Programa encerrado com halt.' : `Programa finalizado em ${secs}s.`, 'ok');
    renderVars(interp.snapshot(), 'Valores ao final da execução');
  } catch (e) {
    if (e instanceof StopSignal) {
      terminal.system('Execução interrompida.', 'warn');
      renderVars(interp.snapshot(), 'Valores quando foi interrompido');
    } else if (e instanceof PascalRuntimeError) {
      const div = terminal.system('', 'error');
      div.append(`Erro de execução${e.code ? ` (${e.code})` : ''}: ${e.message}`);
      if (e.line) {
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = ` — linha ${e.line}`;
        a.onclick = (ev) => {
          ev.preventDefault();
          goToLine(e.line);
        };
        div.appendChild(a);
      }
      if (e.hint) {
        const hint = document.createElement('div');
        hint.className = 'pb-term__hint';
        hint.textContent = 'Dica: ' + e.hint;
        div.appendChild(hint);
      }
      renderVars(interp.snapshot(), `Valores no momento do erro (linha ${e.line})`);
      goToLine(e.line);
      ensureConsoleVisible();
    } else {
      console.error(e);
      terminal.system('Erro interno do interpretador: ' + e.message, 'error');
    }
  } finally {
    clearTimeout(slowTimer);
    terminal.cancel();
    state.running = null;
    setRunningLine(0);
    updateRunUI();
  }
}

function stepNext() {
  const r = state.running;
  if (!r || !r.step) return;
  if (r.auto) {
    r.auto = false;
    clearTimeout(r.timer);
    updateRunUI();
  }
  if (r.resolve) r.resolve();
}

function stopRun() {
  const r = state.running;
  if (!r) return;
  r.interp.stop();
  clearTimeout(r.timer);
  terminal.cancel();
  if (r.resolve) r.resolve();
}

$('btnRun').onclick = () => run(false);
$('btnStep').onclick = () => run(true);
$('btnStop').onclick = stopRun;
$('dbgNext').onclick = stepNext;
$('dbgPlay').onclick = () => {
  const r = state.running;
  if (!r) return;
  r.auto = !r.auto;
  updateRunUI();
  if (r.auto && r.resolve) r.resolve();
  if (!r.auto) clearTimeout(r.timer);
};
$('dbgFinish').onclick = () => {
  const r = state.running;
  if (!r) return;
  r.interp.onStep = null;
  r.step = false;
  clearTimeout(r.timer);
  setRunningLine(0);
  updateRunUI();
  if (r.resolve) r.resolve();
};
$('btnClearConsole').onclick = () => {
  if (!state.running) {
    terminal.clear();
    state.prevVars = null;
    renderVars(null);
  }
};
$('status').onclick = () => showTab('problems');

// ------------------------------------------------------------------ Barra lateral: trechos
function buildSnippets() {
  const el = $('snippets');
  el.innerHTML = '<div class="snip__title">Operadores e funções <span class="snip__sub">clique em um campo e depois no item</span></div>';
  for (const g of SNIPPETS) {
    const grp = document.createElement('div');
    grp.className = 'snip__grp';
    grp.innerHTML = `<div class="snip__gname">${g.group}</div>`;
    const list = document.createElement('div');
    list.className = 'snip__list';
    for (const it of g.items) {
      const b = document.createElement('button');
      b.className = 'snip__item';
      b.type = 'button';
      b.textContent = it.s;
      b.title = it.d;
      b.draggable = true;
      b.addEventListener('mousedown', (ev) => ev.preventDefault());
      b.addEventListener('click', () => blocks.insertSnippet(it.s));
      b.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/plain', ' ' + it.s.replace('( )', '()').replace('[ ]', '[]') + ' ');
        ev.dataTransfer.effectAllowed = 'copy';
      });
      list.appendChild(b);
    }
    grp.appendChild(list);
    el.appendChild(grp);
  }
}

// Modelos para o editor de texto
const CODE_TEMPLATES = [
  { group: 'Comandos', items: [
    { l: "writeln('...')", c: "writeln('$');" },
    { l: 'write + readln', c: "write('$: ');\nreadln(x);" },
    { l: 'readln(x)', c: 'readln($);' },
    { l: 'x := valor', c: '$ := 0;' },
    { l: 'if ... then', c: 'if $ then\nbegin\n  \nend;' },
    { l: 'if ... else', c: 'if $ then\nbegin\n  \nend\nelse\nbegin\n  \nend;' },
    { l: 'case ... of', c: 'case $ of\n  1: writeln(\'um\');\n  2: writeln(\'dois\');\nelse\n  writeln(\'outro\');\nend;' },
    { l: 'for ... to', c: 'for i := 1 to $ do\nbegin\n  \nend;' },
    { l: 'while ... do', c: 'while $ do\nbegin\n  \nend;' },
    { l: 'repeat ... until', c: 'repeat\n  \nuntil $;' },
  ] },
  { group: 'Declarações', items: [
    { l: 'var', c: 'var\n  $: integer;' },
    { l: 'const', c: 'const\n  $ = 10;' },
    { l: 'array', c: '$: array[1..10] of integer;' },
    { l: 'record', c: 'type\n  $ = record\n    nome: string;\n    idade: integer;\n  end;' },
    { l: 'procedure', c: 'procedure $(n: integer);\nbegin\n  \nend;' },
    { l: 'function', c: 'function $(n: integer): integer;\nbegin\n  Result := n;\nend;' },
  ] },
];

function buildCodeRef() {
  const el = $('codeRef');
  el.innerHTML = '<div class="snip__title">Inserir no código <span class="snip__sub">insere na posição do cursor</span></div>';
  const insert = (text) => {
    const ta = editor.ta;
    const s = ta.selectionStart;
    const ls = ta.value.lastIndexOf('\n', s - 1) + 1;
    const indent = ta.value.slice(ls, s).match(/^\s*/)[0];
    let t = text.split('\n').map((l, i) => (i ? indent + l : l)).join('\n');
    const caret = t.indexOf('$');
    t = t.replace('$', '');
    ta.focus();
    editor.replace(s, ta.selectionEnd, t);
    const pos = s + (caret >= 0 ? caret : t.length);
    ta.setSelectionRange(pos, pos);
    editor.changed();
  };
  for (const g of CODE_TEMPLATES) {
    const grp = document.createElement('div');
    grp.className = 'snip__grp';
    grp.innerHTML = `<div class="snip__gname">${g.group}</div>`;
    const list = document.createElement('div');
    list.className = 'snip__list snip__list--col';
    for (const it of g.items) {
      const b = document.createElement('button');
      b.className = 'snip__item snip__item--tpl';
      b.textContent = it.l;
      b.title = it.c.replace('$', '…');
      b.addEventListener('mousedown', (ev) => ev.preventDefault());
      b.onclick = () => insert(it.c);
      list.appendChild(b);
    }
    grp.appendChild(list);
    el.appendChild(grp);
  }
  for (const g of SNIPPETS) {
    const grp = document.createElement('div');
    grp.className = 'snip__grp';
    grp.innerHTML = `<div class="snip__gname">${g.group}</div>`;
    const list = document.createElement('div');
    list.className = 'snip__list';
    for (const it of g.items) {
      const b = document.createElement('button');
      b.className = 'snip__item';
      b.textContent = it.s;
      b.title = it.d;
      b.addEventListener('mousedown', (ev) => ev.preventDefault());
      b.onclick = () => {
        let t = it.s.replace('( )', '($)').replace('[ ]', '[$]').replace("''", "'$'");
        if (!t.includes('$')) t = /^[a-z]/i.test(t) && !t.includes('(') ? ` ${t} ` : t.includes('(') ? t.replace('(', '($').replace(/\$\s*/, '$') : ` ${t} `;
        insert(t.replace(/\( , , \)/, '(, , )'));
      };
      list.appendChild(b);
    }
    grp.appendChild(list);
    el.appendChild(grp);
  }
}

// ------------------------------------------------------------------ Menus & Exemplos Didáticos
function closeMenus() {
  document.querySelectorAll('.menu__pop').forEach((m) => (m.hidden = true));
}
function toggleMenu(btn, pop) {
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const was = pop.hidden;
    closeMenus();
    pop.hidden = !was;
  });
}
toggleMenu($('btnExamples'), $('menuExamples'));
toggleMenu($('btnFile'), $('menuFile'));
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('.menu')) closeMenus();
});

function loadExample(ex) {
  if (state.running) stopRun();
  if (convertCodeToBlocks(ex.code, { silent: true })) {
    state.activeExample = ex;
    state.guideCollapsed = false;
    renderExampleGuide();
    terminal.clear();
    state.prevVars = null;
    renderVars(null);
    toast(`Exemplo "${ex.title}" carregado com guia explicativo!`, 'ok');
  }
}

function buildExamplesMenu() {
  const pop = $('menuExamples');
  pop.innerHTML = '';
  const levels = [...new Set(EXAMPLES.map((e) => e.level))];
  for (const lv of levels) {
    const h = document.createElement('div');
    h.className = 'menu__group';
    h.textContent = lv;
    pop.appendChild(h);
    for (const ex of EXAMPLES.filter((e) => e.level === lv)) {
      const b = document.createElement('button');
      b.innerHTML = `
        <span class="menu__ex-title"><span>${escapeHtml(ex.title)}</span></span>
        <span class="menu__ex-desc">${escapeHtml(ex.summary || '')}</span>
      `;
      b.onclick = () => {
        closeMenus();
        loadExample(ex);
      };
      pop.appendChild(b);
    }
  }
}

function hasContent() {
  return state.program.s.body.length > 0 || state.program.s.decls.length > 0;
}

function clearAll() {
  if (state.running) stopRun();
  const empty = createProgram('MeuPrograma');
  state.activeExample = null;
  renderExampleGuide();
  setProgram(empty);
  state.editorSynced = true;
  editor.value = state.gen.code;
  updateBanner();
  terminal.clear();
  state.prevVars = null;
  renderVars(null);
  toast('Área de trabalho limpa! (Use Ctrl+Z para desfazer)', 'ok');
}

function newProgram() {
  if (state.running) stopRun();
  state.activeExample = null;
  renderExampleGuide();
  setProgram(starterProgram());
  state.editorSynced = true;
  editor.value = state.gen.code;
  updateBanner();
  terminal.clear();
  state.prevVars = null;
  renderVars(null);
  toast('Programa inicial carregado! (Use Ctrl+Z para desfazer)', 'ok');
}

function starterProgram() {
  const p = createProgram('MeuPrograma');
  p.s.decls.push(createBlock('var', { names: 'nome', type: 'string' }));
  p.s.body.push(createBlock('clrscr'));
  p.s.body.push(createBlock('ask', { text: 'Qual é o seu nome? ', var: 'nome' }));
  p.s.body.push(createBlock('writeln', { parts: [{ k: 'text', v: 'Olá, ' }, { k: 'expr', v: 'nome', fmt: '' }, { k: 'text', v: '!' }] }));
  return p;
}

$('btnClearAll').onclick = clearAll;

$('menuFile').addEventListener('click', async (ev) => {
  const act = ev.target.closest('button') && ev.target.closest('button').dataset.act;
  if (!act) return;
  closeMenus();
  switch (act) {
    case 'clear':
      clearAll();
      break;
    case 'new':
      newProgram();
      break;
    case 'open':
      $('fileInput').click();
      break;
    case 'save': {
      const data = { format: 'pascalblocks', version: 2, savedAt: new Date().toISOString(), program: state.program, code: editor.value, mode: state.mode };
      download(programName() + '.pas_block', JSON.stringify(data, null, 2), 'application/json');
      break;
    }
    case 'download':
      download(programName() + '.pas', currentSource());
      break;
    case 'copy':
      if (await copyText(currentSource())) toast('Código copiado!', 'ok');
      break;
    case 'share':
      shareLink();
      break;
    default:
  }
});

$('fileInput').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const text = await file.text();
  openText(text, file.name);
});

function openText(text, name = '') {
  const trimmed = text.trim();
  state.activeExample = null;
  renderExampleGuide();
  // Projeto novo (JSON)
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed);
      const p = normalize(data.program);
      if (!p || p.type !== 'program') throw new Error('formato');
      setProgram(p);
      if (data.code && data.code !== state.gen.code) {
        editor.value = data.code;
        state.editorSynced = false;
      } else {
        state.editorSynced = true;
        editor.value = state.gen.code;
      }
      setMode(data.mode === 'code' ? 'code' : 'blocks');
      toast(`Projeto "${name}" aberto`, 'ok');
      return;
    } catch {
      toast('Arquivo .pas_block inválido.', 'error');
      return;
    }
  }
  // Formato antigo (XML) do PascalBlocks
  if (trimmed.startsWith('<')) {
    const doc = new DOMParser().parseFromString(trimmed, 'application/xml');
    const codes = [...doc.getElementsByTagName('block')].map((b) => b.getAttribute('code') || '');
    if (!codes.length) {
      toast('Arquivo XML sem blocos.', 'error');
      return;
    }
    text = codes.join('\n');
    toast('Arquivo do PascalBlocks antigo importado', 'ok');
  }
  // Código Pascal
  editor.value = text;
  state.editorSynced = false;
  if (convertCodeToBlocks(text, { silent: true })) {
    setMode('blocks');
    toast(`"${name || 'código'}" aberto e convertido em blocos`, 'ok');
  } else {
    setMode('code');
    toast('O código tem erros e foi aberto no editor de texto. Corrija-os para converter em blocos.', 'warn');
    showTab('problems');
  }
}

// ------------------------------------------------------------------ Link de compartilhamento
async function compress(text) {
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream === 'undefined') return 'r' + b64(bytes);
  const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = new Uint8Array(await new Response(cs).arrayBuffer());
  return 'z' + b64(buf);
}
async function decompress(s) {
  const kind = s[0];
  const bytes = unb64(s.slice(1));
  if (kind === 'r') return new TextDecoder().decode(bytes);
  const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(await new Response(ds).arrayBuffer());
}
function b64(bytes) {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function shareLink() {
  const enc = await compress(currentSource());
  const url = `${location.origin}${location.pathname}#code=${enc}`;
  if (await copyText(url)) toast('Link copiado! Quem abrir verá este programa.', 'ok');
}

// ------------------------------------------------------------------ Persistência
const scheduleSave = debounce(() => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ program: state.program, code: editor.value, synced: state.editorSynced, mode: state.mode }));
  } catch {
    /* armazenamento indisponível */
  }
}, 400);

async function load() {
  const m = location.hash.match(/#code=([\w-]+)/);
  if (m) {
    try {
      const code = await decompress(m[1]);
      history.stack = [];
      state.program = createProgram();
      blocks.setProgram(state.program);
      openText(code, 'link compartilhado');
      window.history.replaceState(null, '', location.pathname);
      return;
    } catch {
      toast('Não foi possível abrir o link compartilhado.', 'error');
    }
  }
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    saved = null;
  }
  const p = saved && normalize(saved.program);
  setProgram(p && p.type === 'program' ? p : starterProgram());
  if (saved && typeof saved.code === 'string' && !saved.synced) {
    editor.value = saved.code;
    state.editorSynced = false;
  }
  setMode(saved && saved.mode === 'code' ? 'code' : 'blocks');
}

// ------------------------------------------------------------------ Guia & Documentação Completa
const DOC_SECTIONS = [
  { id: 'inicio', icon: 'rocket', title: 'Como Usar o PascalBlocks' },
  { id: 'blocos', icon: 'puzzle', title: 'Todos os Blocos Disponíveis' },
  { id: 'estrutura', icon: 'bookOpen', title: 'Estrutura e Tipos em Pascal' },
  { id: 'operadores', icon: 'sliders', title: 'Operadores e Expressões' },
  { id: 'io', icon: 'terminal', title: 'Entrada, Saída e Formatação' },
  { id: 'controle', icon: 'gitBranch', title: 'Condicionais e Repetição' },
  { id: 'subrotinas', icon: 'wrench', title: 'Procedures, Functions e Vetores' },
  { id: 'funcoes', icon: 'book', title: 'Funções Padrão (50+ Funções)' },
  { id: 'erros', icon: 'heartPulse', title: 'Erros Comuns (Como Resolver)' },
];

let activeDocSec = 'inicio';
let activeFnCat = 'Todas';

function openDocs(sec = activeDocSec) {
  activeDocSec = sec;
  $('docsModal').hidden = false;
  $('docsSearch').value = '';
  renderDocsNav();
  renderDocsSection(sec);
}

function renderDocsNav() {
  const nav = $('docsNav');
  nav.innerHTML = '';
  for (const s of DOC_SECTIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'docs-nav__btn' + (s.id === activeDocSec ? ' docs-nav__btn--on' : '');
    b.innerHTML = `${icon(s.icon, 16)}<span>${escapeHtml(s.title)}</span>`;
    b.onclick = () => {
      activeDocSec = s.id;
      $('docsSearch').value = '';
      renderDocsNav();
      renderDocsSection(s.id);
    };
    nav.appendChild(b);
  }
}

function renderFnCard(fn) {
  return `
    <div class="doc-fn">
      <div class="doc-fn__head">
        <span class="doc-fn__sig">${escapeHtml(fn.sig)}</span>
        <span class="doc-fn__ret">${escapeHtml(fn.ret)}</span>
        <span class="doc-fn__cat">${escapeHtml(fn.cat)}</span>
      </div>
      <p style="margin:4px 0 6px;"><b>${escapeHtml(fn.desc)}</b> ${escapeHtml(fn.detail || '')}</p>
      <pre class="doc-pre">${escapeHtml(fn.example)}</pre>
    </div>
  `;
}

function renderBlockCard(b) {
  const def = BLOCKS[b.type] || { cat: 'misc' };
  const color = CAT_COLOR[def.cat] || '#64748b';
  return `
    <div class="doc-blk" style="--c:${color}">
      <div class="doc-blk__top">
        <strong style="font-size:14.5px;color:#0f172a;">${escapeHtml(b.title)}</strong>
        <button type="button" class="btn btn--small" data-doc-add-block="${escapeHtml(b.type)}">${icon('plus', 13)} Inserir bloco no programa</button>
      </div>
      <p style="margin:4px 0;"><b>Quando usar:</b> ${escapeHtml(b.when)}</p>
      <p style="margin:4px 0;color:#475569;font-size:12.5px;"><b>Campos:</b> ${escapeHtml(b.fields)}</p>
      <pre class="doc-pre">${escapeHtml(b.pascal)}</pre>
    </div>
  `;
}

function renderDocsSearch(q) {
  const term = q.trim().toLowerCase();
  const c = $('docsContent');
  if (!term) {
    renderDocsSection(activeDocSec);
    return;
  }
  const fns = STDLIB_DOCS.filter(
    (f) =>
      f.name.toLowerCase().includes(term) ||
      f.sig.toLowerCase().includes(term) ||
      f.desc.toLowerCase().includes(term) ||
      (f.detail && f.detail.toLowerCase().includes(term)) ||
      f.cat.toLowerCase().includes(term),
  );
  const blks = BLOCK_DOCS.filter(
    (b) =>
      b.type.toLowerCase().includes(term) ||
      b.title.toLowerCase().includes(term) ||
      b.when.toLowerCase().includes(term) ||
      b.pascal.toLowerCase().includes(term),
  );
  const errs = COMMON_ERRORS_DOC.filter(
    (e) => e.title.toLowerCase().includes(term) || e.why.toLowerCase().includes(term) || e.right.toLowerCase().includes(term),
  );
  let html = `<h3>${icon('search', 18)} Resultados da busca por "${escapeHtml(q)}"</h3>`;
  if (!fns.length && !blks.length && !errs.length) {
    html += `<p class="docs-lead">Nenhum item encontrado para "${escapeHtml(q)}". Tente buscar pelo nome da função (ex.: <code>sqrt</code>, <code>copy</code>, <code>mod</code>, <code>random</code>) ou estrutura (ex.: <code>for</code>, <code>if</code>, <code>array</code>).</p>`;
    c.innerHTML = html;
    return;
  }
  if (fns.length) {
    html += `<h4>${icon('book', 15)} Funções e Procedimentos (${fns.length})</h4>` + fns.map(renderFnCard).join('');
  }
  if (blks.length) {
    html += `<h4>${icon('puzzle', 15)} Blocos (${blks.length})</h4>` + blks.map(renderBlockCard).join('');
  }
  if (errs.length) {
    html += `<h4>${icon('heartPulse', 15)} Dúvidas e Erros Comuns (${errs.length})</h4>`;
    for (const e of errs) {
      html += `<div class="doc-card" style="margin-bottom:10px;"><h5>${escapeHtml(e.title)}</h5><p>${escapeHtml(e.why)}</p><pre class="doc-pre doc-pre--right">${escapeHtml(e.right)}</pre></div>`;
    }
  }
  c.innerHTML = html;
}

function renderDocsSection(sec) {
  const c = $('docsContent');
  c.scrollTop = 0;
  if (sec === 'inicio') {
    c.innerHTML = `
      <h3>${icon('rocket', 18)} Como Usar o PascalBlocks</h3>
      <p class="docs-lead">O PascalBlocks foi pensado para você aprender programação em Pascal de forma visual (com blocos que nunca erram a pontuação) e também escrevendo código real, tudo direto no navegador.</p>
      <div class="doc-grid">
        <div class="doc-card">
          <h5>${icon('puzzle', 15)} 1. Montando com Blocos</h5>
          <p>Clique em qualquer bloco na barra lateral esquerda para adicioná-lo ao programa ou <b>arraste-o</b> até a posição desejada. Blocos como <code>if</code>, <code>for</code>, <code>while</code> e <code>repeat</code> têm <b>encaixes internos</b>: arraste outros blocos para dentro deles!</p>
        </div>
        <div class="doc-card">
          <h5>${icon('printer', 15)} 2. Escrevendo com writeln</h5>
          <p>No bloco <code>writeln</code>, você combina quantas partes quiser clicando em <b>+ texto</b> (para frases fixas — sem precisar digitar apóstrofos!) e <b>+ valor</b> (para variáveis ou contas). No campinho <code>:fmt</code>, digite <code>0:2</code> para mostrar números reais com 2 casas decimais.</p>
        </div>
        <div class="doc-card">
          <h5>${icon('step', 15)} 3. Console + Variáveis ao Mesmo Tempo</h5>
          <p>No painel direito inferior, a visualização <b>Console &amp; Variáveis</b> mostra a saída do programa e a tabela de variáveis simultaneamente. Clique em <b>Passo a passo (F10)</b> para executar uma linha por vez e ver cada variável mudar de valor (<code>anterior → novo</code>)!</p>
        </div>
        <div class="doc-card">
          <h5>${icon('code', 15)} 4. Modo Código ↔ Blocos</h5>
          <p>Alterne para a aba <b>Código</b> para escrever ou editar Pascal manualmente com destaque de sintaxe e verificação de erros ao vivo. Depois, clique em <b>Converter em blocos</b> para transformar seu código de volta em blocos visuais!</p>
        </div>
      </div>
      <h4>${icon('keyboard', 15)} Atalhos de Teclado Úteis</h4>
      <table class="doc-tbl">
        <thead><tr><th>Atalho</th><th>O que faz</th></tr></thead>
        <tbody>
          <tr><td><kbd>F5</kbd> ou <kbd>Ctrl</kbd>+<kbd>Enter</kbd></td><td>Executa o programa imediatamente</td></tr>
          <tr><td><kbd>F10</kbd></td><td>Inicia o modo <b>Passo a passo</b> (ou avança para a próxima linha)</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Para a execução atual (inclusive se houver um laço infinito)</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd></td><td>Desfazer / Refazer alterações nos blocos (inclusive após clicar em <b>Limpar tudo</b>)</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>D</kbd></td><td>Duplica o bloco selecionado</td></tr>
          <tr><td><kbd>Delete</kbd></td><td>Remove o bloco selecionado</td></tr>
        </tbody>
      </table>
    `;
  } else if (sec === 'blocos') {
    c.innerHTML = `
      <h3>${icon('puzzle', 18)} Todos os Blocos Disponíveis</h3>
      <p class="docs-lead">Veja para que serve cada bloco da barra lateral, o que preencher em seus campos e o código Pascal exato que ele gera. Você pode clicar em <b>Inserir bloco</b> para adicioná-lo direto ao seu programa!</p>
      ${BLOCK_DOCS.map(renderBlockCard).join('')}
    `;
  } else if (sec === 'estrutura') {
    c.innerHTML = `
      <h3>${icon('bookOpen', 18)} Estrutura de um Programa e Tipos de Dados em Pascal</h3>
      <p class="docs-lead">Todo programa em Pascal segue uma organização clara dividida em cabeçalho, declarações e bloco principal.</p>
      <pre class="doc-pre">program NomeDoPrograma;
uses crt;               { opcional: ativa comandos de tela e cores }

const
  LIMITE = 100;         { constantes: valores fixos }

type
  TLista = array[1..10] of integer; { novos tipos }

var
  x, soma: integer;     { variáveis que o programa vai usar }
  nome: string;

begin
  { aqui dentro ficam os comandos do programa principal }
  writeln('Olá!');
end.                    { o programa sempre termina com end. (com ponto final) }</pre>

      <div class="doc-callout">
        ${icon('lightbulb', 14)} <b>Dica:</b> Pascal <b>não diferencia maiúsculas de minúsculas</b> nos nomes de comandos e variáveis: <code>Writeln</code>, <code>WRITELN</code> e <code>writeln</code> são exatamente a mesma coisa!
      </div>

      <h4>${icon('box', 15)} Tipos de Dados Disponíveis</h4>
      <table class="doc-tbl">
        <thead><tr><th>Tipo</th><th>O que guarda</th><th>Exemplos de valores</th><th>Exemplo de declaração</th></tr></thead>
        <tbody>
          <tr><td><code>integer</code> / <code>longint</code></td><td>Números inteiros (positivos, negativos ou zero, sem casas decimais)</td><td><code>0</code>, <code>42</code>, <code>-15</code></td><td><code>idade, cont: integer;</code></td></tr>
          <tr><td><code>real</code> / <code>double</code></td><td>Números reais (com casas decimais; usa ponto <code>.</code> no código)</td><td><code>3.14</code>, <code>-0.5</code>, <code>10.0</code></td><td><code>nota, media, preco: real;</code></td></tr>
          <tr><td><code>string</code></td><td>Textos, palavras ou frases (entre apóstrofos simples)</td><td><code>'Ana'</code>, <code>'Olá mundo!'</code>, <code>''</code></td><td><code>nome, frase: string;</code></td></tr>
          <tr><td><code>char</code></td><td>Um único caractere (uma letra, dígito ou símbolo)</td><td><code>'A'</code>, <code>'+'</code>, <code>#65</code></td><td><code>letra, opcao: char;</code></td></tr>
          <tr><td><code>boolean</code></td><td>Valor lógico: apenas verdadeiro ou falso</td><td><code>true</code>, <code>false</code></td><td><code>achou, ativo: boolean;</code></td></tr>
          <tr><td><code>array[a..b] of T</code></td><td>Vetor (lista) ou matriz (tabela) de elementos do mesmo tipo</td><td><code>v[1] := 10; m[2,3] := 5;</code></td><td><code>v: array[1..10] of integer;</code></td></tr>
          <tr><td><code>record ... end</code></td><td>Registro que agrupa campos de tipos diferentes</td><td><code>aluno.nome := 'Bia';</code></td><td><code>type TAluno = record nome: string; nota: real; end;</code></td></tr>
          <tr><td><code>set of ...</code></td><td>Conjunto de valores ordinais (usado com o operador <code>in</code>)</td><td><code>['A', 'E', 'I', 'O', 'U']</code></td><td><code>vogais: set of char;</code></td></tr>
        </tbody>
      </table>
    `;
  } else if (sec === 'operadores') {
    c.innerHTML = `
      <h3>${icon('sliders', 18)} Operadores Aritméticos, Relacionais e Lógicos</h3>
      <p class="docs-lead">Conheça os símbolos usados para fazer cálculos e montar condições em Pascal.</p>

      <h4>1. Operadores Aritméticos (Cálculos)</h4>
      <table class="doc-tbl">
        <thead><tr><th>Operador</th><th>Significado</th><th>Exemplo</th><th>Resultado</th></tr></thead>
        <tbody>
          <tr><td><code>+</code></td><td>Soma (ou junta duas strings)</td><td><code>7 + 3</code> / <code>'Oi ' + 'Ana'</code></td><td><code>10</code> / <code>'Oi Ana'</code></td></tr>
          <tr><td><code>-</code></td><td>Subtração</td><td><code>10 - 4</code></td><td><code>6</code></td></tr>
          <tr><td><code>*</code></td><td>Multiplicação</td><td><code>6 * 5</code></td><td><code>30</code></td></tr>
          <tr><td><code>/</code></td><td><b>Divisão Real</b> (sempre devolve um número <code>real</code>!)</td><td><code>7 / 2</code></td><td><code>3.5</code> (tipo <code>real</code>)</td></tr>
          <tr><td><code>div</code></td><td><b>Divisão Inteira</b> (quociente inteiro, descarta a sobra)</td><td><code>7 div 2</code></td><td><code>3</code> (tipo <code>integer</code>)</td></tr>
          <tr><td><code>mod</code></td><td><b>Resto da Divisão Inteira</b> (muito usado para saber se é par/múltiplo)</td><td><code>7 mod 2</code></td><td><code>1</code> (sobra 1)</td></tr>
        </tbody>
      </table>

      <h4>2. Operadores Relacionais (Comparações — devolvem <code>true</code> ou <code>false</code>)</h4>
      <table class="doc-tbl">
        <thead><tr><th>Operador</th><th>Significado</th><th>Exemplo</th></tr></thead>
        <tbody>
          <tr><td><code>=</code></td><td>Igual a (cuidado: não confunda com <code>:=</code> de atribuição!)</td><td><code>if x = 10 then</code></td></tr>
          <tr><td><code>&lt;&gt;</code></td><td>Diferente de</td><td><code>while n &lt;&gt; 0 do</code></td></tr>
          <tr><td><code>&gt;</code></td><td>Maior que</td><td><code>if idade &gt; 18 then</code></td></tr>
          <tr><td><code>&lt;</code></td><td>Menor que</td><td><code>if temp &lt; 0 then</code></td></tr>
          <tr><td><code>&gt;=</code></td><td>Maior ou igual a</td><td><code>if media &gt;= 7 then</code></td></tr>
          <tr><td><code>&lt;=</code></td><td>Menor ou igual a</td><td><code>for i := 1 to 10</code> / <code>if x &lt;= 100 then</code></td></tr>
          <tr><td><code>in</code></td><td>Pertence ao conjunto</td><td><code>if letra in ['a'..'z', 'A'..'Z'] then</code></td></tr>
        </tbody>
      </table>

      <h4>3. Operadores Lógicos (Combinando Condições)</h4>
      <table class="doc-tbl">
        <thead><tr><th>Operador</th><th>Como funciona</th><th>Exemplo correto em Pascal</th></tr></thead>
        <tbody>
          <tr><td><code>and</code> (E)</td><td>Verdadeiro somente se <b>TODAS</b> as condições forem verdadeiras</td><td><code>if (nota &gt;= 7) and (faltas &lt;= 10) then</code></td></tr>
          <tr><td><code>or</code> (OU)</td><td>Verdadeiro se <b>PELO MENOS UMA</b> das condições for verdadeira</td><td><code>if (op = 'S') or (op = 's') then</code></td></tr>
          <tr><td><code>not</code> (NÃO)</td><td>Inverte o valor lógico (verdadeiro vira falso e vice-versa)</td><td><code>if not achou then</code></td></tr>
          <tr><td><code>xor</code> (OU exclusivo)</td><td>Verdadeiro se exatamente uma das condições for verdadeira</td><td><code>if a xor b then</code></td></tr>
        </tbody>
      </table>
      <div class="doc-callout doc-callout--warn">
        ${icon('alert', 14)} <b>Regra de Ouro do Pascal:</b> Ao combinar comparações com <code>and</code> ou <code>or</code>, <b>SEMPRE coloque parênteses em cada comparação</b>: escreva <code>(x &gt; 0) and (y &gt; 0)</code>, e nunca <code>x &gt; 0 and y &gt; 0</code>!
      </div>
    `;
  } else if (sec === 'io') {
    c.innerHTML = `
      <h3>${icon('terminal', 18)} Entrada, Saída e Formatação (write, writeln, readln)</h3>
      <p class="docs-lead">Como conversar com o usuário pelo Console e formatar números perfeitamente.</p>

      <h4>1. Mostrando informações: <code>write</code> vs <code>writeln</code></h4>
      <ul>
        <li><code>writeln(...)</code> escreve os valores na tela e <b>pula para a linha de baixo</b> no final.</li>
        <li><code>write(...)</code> escreve na tela e <b>continua na mesma linha</b> (ótimo para fazer uma pergunta antes do <code>readln</code>).</li>
        <li>Você pode passar vários itens separados por vírgula: <code>writeln('O dobro de ', n, ' é ', n * 2);</code>.</li>
      </ul>

      <h4>2. Formatando Casas Decimais e Largura (<code>:largura:casas</code>)</h4>
      <p>Em Pascal, números do tipo <code>real</code> por padrão aparecem em notação científica se não forem formatados. Para formatar qualquer valor no <code>write</code> / <code>writeln</code>:</p>
      <table class="doc-tbl">
        <thead><tr><th>Formato no código</th><th>No campo <code>:fmt</code> do bloco</th><th>Como funciona</th><th>Saída para <code>x = 7.5</code></th></tr></thead>
        <tbody>
          <tr><td><code>x:0:2</code></td><td><code>0:2</code></td><td>Mostra com <b>2 casas decimais</b> (sem espaços extras à esquerda)</td><td><code>7.50</code></td></tr>
          <tr><td><code>x:0:0</code></td><td><code>0:0</code></td><td>Mostra o número real arredondado sem casas decimais</td><td><code>8</code></td></tr>
          <tr><td><code>x:8:2</code></td><td><code>8:2</code></td><td>Ocupa 8 colunas no total (alinhado à direita) com 2 casas decimais</td><td><code>    7.50</code></td></tr>
          <tr><td><code>n:4</code></td><td><code>4</code></td><td>Alinha um inteiro ou texto ocupando pelo menos 4 espaços à direita</td><td><code>   7</code></td></tr>
        </tbody>
      </table>

      <h4>3. Lendo dados digitados: <code>readln</code></h4>
      <pre class="doc-pre">var
  nome: string;
  idade: integer;
begin
  write('Digite seu nome: ');
  readln(nome);
  write('Digite sua idade: ');
  readln(idade);
  writeln(nome, ' tem ', idade, ' anos.');
end.</pre>
    `;
  } else if (sec === 'controle') {
    c.innerHTML = `
      <h3>${icon('gitBranch', 18)} Estruturas Condicionais e Laços de Repetição</h3>
      <p class="docs-lead">Como fazer o programa tomar decisões e repetir tarefas automaticamente.</p>

      <h4>1. Decisões com <code>if ... then ... else</code> e <code>case ... of</code></h4>
      <div class="doc-grid">
        <div class="doc-card">
          <h5>Se / Senão (<code>if ... then ... else</code>)</h5>
          <p>Testa qualquer condição lógica (maior, menor, igual, <code>and</code>, <code>or</code>).</p>
          <pre class="doc-pre">if media >= 7 then
begin
  writeln('Aprovado!');
end
else
begin
  writeln('Estude mais um pouco.');
end;</pre>
        </div>
        <div class="doc-card">
          <h5>Escolha (<code>case ... of</code>)</h5>
          <p>Ideal quando uma variável pode assumir vários valores fixos ou faixas (<code>1..5</code>).</p>
          <pre class="doc-pre">case nota of
  9, 10: writeln('Excelente');
  7..8:  writeln('Bom');
  0..6:  writeln('Precisa melhorar');
else
  writeln('Nota inválida');
end;</pre>
        </div>
      </div>

      <h4>2. Qual Laço de Repetição Escolher? (<code>for</code> vs <code>while</code> vs <code>repeat</code>)</h4>
      <table class="doc-tbl">
        <thead><tr><th>Laço</th><th>Quando usar</th><th>Onde testa a condição</th><th>Exemplo</th></tr></thead>
        <tbody>
          <tr>
            <td><code>for i := ini to fim do</code><br><code>for i := ini downto fim do</code></td>
            <td>Quando você <b>sabe de antemão quantas vezes</b> quer repetir (ex.: de 1 até 10, ou percorrer um vetor).</td>
            <td>Conta automaticamente a cada volta (<code>to</code> soma 1; <code>downto</code> subtrai 1).</td>
            <td><code>for i := 1 to 10 do<br>&nbsp;&nbsp;writeln(i);</code></td>
          </tr>
          <tr>
            <td><code>while condicao do</code></td>
            <td>Quando <b>não sabe quantas vezes</b> vai repetir e quer continuar <b>ENQUANTO</b> a condição for verdadeira.</td>
            <td>No <b>início</b> (se a condição já começar falsa, não executa nenhuma vez).</td>
            <td><code>while n &lt;&gt; 0 do<br>begin<br>&nbsp;&nbsp;soma := soma + n;<br>&nbsp;&nbsp;readln(n);<br>end;</code></td>
          </tr>
          <tr>
            <td><code>repeat ... until condicao;</code></td>
            <td>Quando precisa executar o bloco <b>pelo menos uma vez</b> (ex.: validar entrada ou jogo) e repetir <b>ATÉ QUE</b> a condição seja atingida.</td>
            <td>No <b>final</b> (para quando a condição do <code>until</code> fica verdadeira).</td>
            <td><code>repeat<br>&nbsp;&nbsp;readln(nota);<br>until (nota &gt;= 0) and (nota &lt;= 10);</code></td>
          </tr>
        </tbody>
      </table>
    `;
  } else if (sec === 'subrotinas') {
    c.innerHTML = `
      <h3>${icon('wrench', 18)} Procedimentos, Funções e Vetores</h3>
      <p class="docs-lead">Organize programas maiores dividindo o problema em sub-rotinas reutilizáveis e listas de dados.</p>

      <h4>1. Diferença entre <code>procedure</code> e <code>function</code></h4>
      <div class="doc-grid">
        <div class="doc-card">
          <h5>Procedimento (<code>procedure</code>)</h5>
          <p>Executa uma tarefa (como imprimir um cabeçalho ou alterar uma variável <code>var</code>), mas <b>não devolve um valor em uma conta</b>.</p>
          <pre class="doc-pre">procedure Linha(tam: integer);
var i: integer;
begin
  for i := 1 to tam do write('-');
  writeln;
end;</pre>
        </div>
        <div class="doc-card">
          <h5>Função (<code>function</code>)</h5>
          <p>Calcula e <b>devolve um resultado</b> de um tipo específico. Para devolver o valor, atribua ao nome da função (ou a <code>Result</code>).</p>
          <pre class="doc-pre">function Maior(a, b: integer): integer;
begin
  if a > b then
    Maior := a
  else
    Maior := b;
end;</pre>
        </div>
      </div>

      <h4>2. Parâmetros por Valor vs. por Referência (<code>var</code>)</h4>
      <ul>
        <li><b>Por valor</b> (ex.: <code>procedure P(x: integer)</code>): a sub-rotina recebe apenas uma <b>cópia</b> do valor. Alterar <code>x</code> lá dentro não muda a variável original.</li>
        <li><b>Por referência com <code>var</code></b> (ex.: <code>procedure Troca(var a, b: integer)</code>): a sub-rotina recebe a <b>própria variável original</b>. Qualquer mudança em <code>a</code> ou <code>b</code> altera imediatamente as variáveis passadas na chamada!</li>
      </ul>

      <h4>3. Vetores (Arrays) e Matrizes</h4>
      <pre class="doc-pre">var
  notas: array[1..5] of real;         { vetor de 5 posições: notas[1] até notas[5] }
  tab:   array[1..3, 1..3] of integer;{ matriz 3x3: tab[linha, coluna] }
  i: integer;
begin
  for i := 1 to 5 do
    notas[i] := i * 2.0;
end.</pre>
    `;
  } else if (sec === 'funcoes') {
    const cats = ['Todas', ...new Set(STDLIB_DOCS.map((f) => f.cat))];
    const list = activeFnCat === 'Todas' ? STDLIB_DOCS : STDLIB_DOCS.filter((f) => f.cat === activeFnCat);
    const chipsHtml = cats
      .map((cat) => `<button type="button" class="doc-fn-chip${cat === activeFnCat ? ' doc-fn-chip--on' : ''}" data-fn-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`)
      .join('');
    const colorsHtml = CRT_COLORS_DOC.map(
      (col) => `
      <div class="crt-swatch">
        <span class="crt-swatch__box" style="background:${col.hex}"></span>
        <div>
          <code>${col.name}</code> <small style="color:#64748b">(${col.code})</small><br>
          <span style="font-size:11px;color:#475569">${escapeHtml(col.pt)}</span>
        </div>
      </div>
    `,
    ).join('');
    c.innerHTML = `
      <h3>${icon('book', 18)} Catálogo Completo de Funções e Procedimentos Padrão</h3>
      <p class="docs-lead">Todas as ${STDLIB_DOCS.length} funções e procedimentos nativos disponíveis no compilador PascalBlocks. Clique em uma categoria abaixo ou use a barra de busca no topo.</p>
      <div class="doc-fn-filter">${chipsHtml}</div>
      ${list.map(renderFnCard).join('')}
      <h4>${icon('palette', 15)} Tabela das 16 Cores da Unit CRT (para <code>textcolor</code> e <code>textbackground</code>)</h4>
      <div class="crt-grid">${colorsHtml}</div>
    `;
  } else if (sec === 'erros') {
    c.innerHTML = `
      <h3>${icon('heartPulse', 18)} Guia de Erros Comuns em Pascal (E Como Resolver)</h3>
      <p class="docs-lead">Está recebendo uma mensagem de erro? Veja os tropeços mais comuns de quem está aprendendo Pascal e compare o jeito errado com o jeito certo.</p>
      ${COMMON_ERRORS_DOC.map(
        (e) => `
        <div class="doc-card" style="margin-bottom:14px;">
          <h5>${escapeHtml(e.title)}</h5>
          <p>${escapeHtml(e.why)}</p>
          <div class="doc-grid" style="margin:6px 0 0;">
            <div>
              <strong style="color:#991b1b;font-size:12px;">${icon('x', 13)} Como NÃO escrever:</strong>
              <pre class="doc-pre doc-pre--wrong">${escapeHtml(e.wrong)}</pre>
            </div>
            <div>
              <strong style="color:#166534;font-size:12px;">${icon('check', 13)} Como escrever CERTO:</strong>
              <pre class="doc-pre doc-pre--right">${escapeHtml(e.right)}</pre>
            </div>
          </div>
        </div>
      `,
      ).join('')}
    `;
  }
}

$('btnDocs').onclick = () => openDocs();
$('docsModal').addEventListener('click', (ev) => {
  if (ev.target.closest('[data-close-docs]')) {
    $('docsModal').hidden = true;
    return;
  }
  const catBtn = ev.target.closest('[data-fn-cat]');
  if (catBtn) {
    activeFnCat = catBtn.dataset.fnCat;
    renderDocsSection('funcoes');
    return;
  }
  const addBlk = ev.target.closest('[data-doc-add-block]');
  if (addBlk) {
    const type = addBlk.dataset.docAddBlock;
    $('docsModal').hidden = true;
    setMode('blocks');
    blocks.addFromPalette({ type });
    toast(`Bloco "${type}" adicionado ao programa!`, 'ok');
  }
});
$('docsSearch').addEventListener('input', (ev) => {
  renderDocsSearch(ev.target.value);
});

// ------------------------------------------------------------------ Botões diversos
$('tabBlocks').onclick = () => setMode('blocks');
$('tabCode').onclick = () => setMode('code');
$('btnToBlocks').onclick = () => {
  convertCodeToBlocks();
};
$('btnEditCode').onclick = () => {
  editor.value = state.gen.code;
  state.editorSynced = true;
  setMode('code');
};
$('btnCopyCode').onclick = async () => {
  if (await copyText(state.gen.code)) toast('Código copiado!', 'ok');
};
$('btnUndo').onclick = undo;
$('btnRedo').onclick = redo;

// ------------------------------------------------------------------ Teclado
document.addEventListener('keydown', (ev) => {
  const mod = ev.ctrlKey || ev.metaKey;
  const inField = ev.target.closest && ev.target.closest('input, textarea, select');
  if (ev.key === 'F5' || (mod && ev.key === 'Enter')) {
    ev.preventDefault();
    run(false);
    return;
  }
  if (ev.key === 'F10') {
    ev.preventDefault();
    if (state.running && state.running.step) stepNext();
    else if (!state.running) run(true);
    return;
  }
  if (ev.key === 'Escape') {
    if (!$('docsModal').hidden) {
      $('docsModal').hidden = true;
      return;
    }
    if (state.running) {
      stopRun();
      return;
    }
    closeMenus();
  }
  if (state.mode !== 'blocks' || inField) return;
  if (mod && ev.key.toLowerCase() === 'z' && !ev.shiftKey) {
    ev.preventDefault();
    undo();
    return;
  }
  if (mod && (ev.key.toLowerCase() === 'y' || (ev.key.toLowerCase() === 'z' && ev.shiftKey))) {
    ev.preventDefault();
    redo();
    return;
  }
  blocks.handleKey(ev);
});

window.addEventListener('beforeunload', () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ program: state.program, code: editor.value, synced: state.editorSynced, mode: state.mode }));
  } catch {
    /* ignora */
  }
});

// ------------------------------------------------------------------ Divisores redimensionáveis
function makeSplitter(el, onMove) {
  el.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    el.setPointerCapture(ev.pointerId);
    document.body.classList.add('is-resizing');
    const move = (e) => onMove(e);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      document.body.classList.remove('is-resizing');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  });
}
makeSplitter($('splitV'), (e) => {
  const w = Math.max(280, Math.min(window.innerWidth - 600, window.innerWidth - e.clientX));
  document.documentElement.style.setProperty('--right-w', w + 'px');
});
makeSplitter($('splitH'), (e) => {
  const r = $('right').getBoundingClientRect();
  const pct = Math.max(15, Math.min(80, ((e.clientY - r.top) / r.height) * 100));
  document.documentElement.style.setProperty('--preview-h', pct + '%');
});

// ------------------------------------------------------------------ Início
buildSnippets();
buildCodeRef();
buildExamplesMenu();
renderVars(null);
updateRunUI();
load().then(() => {
  terminal.system('Bem-vindo ao PascalBlocks! Monte seu programa e clique em Executar ou Passo a passo.', 'info');
});

// expõe para depuração no console do navegador
window.pascalblocks = { state, blocks, editor, compile, findBlock, openDocs, clearAll, loadExample };
