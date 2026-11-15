// Modelo de dados dos blocos (árvore de objetos simples, serializável em JSON).
import { BLOCKS } from './defs.js';

let counter = 0;
export function newId() {
  counter++;
  return 'b' + Date.now().toString(36) + counter.toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

export function slotNames(type) {
  const def = BLOCKS[type];
  if (type === 'program') return ['decls', 'body'];
  if (!def || !def.rows) return [];
  return def.rows.filter((r) => r.slot).map((r) => r.slot);
}

export function slotAccepts(type, slot) {
  if (type === 'program') return slot === 'decls' ? 'decl' : 'stmt';
  const def = BLOCKS[type];
  const r = def.rows.find((x) => x.slot === slot);
  return (r && r.accepts) || 'stmt';
}

export function createBlock(type, fields) {
  const def = BLOCKS[type];
  const b = { id: newId(), type, f: JSON.parse(JSON.stringify(def.fields || {})), s: {} };
  if (fields) Object.assign(b.f, JSON.parse(JSON.stringify(fields)));
  for (const s of slotNames(type)) b.s[s] = [];
  return b;
}

export function createProgram(name = 'MeuPrograma') {
  return { id: newId(), type: 'program', f: { name, crt: true }, s: { decls: [], body: [] } };
}

/** Clona um bloco com novos ids. */
export function cloneBlock(b) {
  const c = { id: newId(), type: b.type, f: JSON.parse(JSON.stringify(b.f)), s: {} };
  for (const k in b.s) c.s[k] = b.s[k].map(cloneBlock);
  return c;
}

/** Percorre todos os blocos. cb(block, parent, slot, index) */
export function walk(root, cb, parent = null, slot = null, index = 0) {
  if (cb(root, parent, slot, index) === false) return false;
  for (const k in root.s) {
    const list = root.s[k];
    for (let i = 0; i < list.length; i++) {
      if (walk(list[i], cb, root, k, i) === false) return false;
    }
  }
  return true;
}

export function findBlock(root, id) {
  let found = null;
  walk(root, (b, parent, slot, index) => {
    if (b.id === id) {
      found = { block: b, parent, slot, index };
      return false;
    }
    return true;
  });
  return found;
}

export function removeBlock(root, id) {
  const f = findBlock(root, id);
  if (!f || !f.parent) return null;
  f.parent.s[f.slot].splice(f.index, 1);
  return f;
}

export function isAncestor(ancestor, id) {
  let res = false;
  walk(ancestor, (b) => {
    if (b.id === id) {
      res = true;
      return false;
    }
    return true;
  });
  return res;
}

/** Garante a estrutura correta (útil ao importar arquivos). */
export function normalize(b) {
  if (!b || typeof b !== 'object' || (!BLOCKS[b.type] && b.type !== 'program')) return null;
  const out = { id: typeof b.id === 'string' ? b.id : newId(), type: b.type, f: {}, s: {} };
  const def = BLOCKS[b.type];
  Object.assign(out.f, JSON.parse(JSON.stringify(def.fields || {})), b.f || {});
  for (const s of slotNames(b.type)) {
    const list = (b.s && Array.isArray(b.s[s])) ? b.s[s] : [];
    out.s[s] = list.map(normalize).filter(Boolean);
  }
  return out;
}

