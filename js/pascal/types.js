// Sistema de tipos do Pascal suportado.
export const T_INT = { k: 'int' };
export const T_REAL = { k: 'real' };
export const T_BOOL = { k: 'bool' };
export const T_CHAR = { k: 'char' };
export const T_STR = { k: 'str' };
export const T_VOID = { k: 'void' };
export const T_ANY = { k: 'any' }; // usado para recuperação de erros
export const T_SET_ANY = { k: 'set', elem: T_ANY };

export const BASE_TYPES = {
  integer: T_INT, longint: T_INT, shortint: T_INT, smallint: T_INT, byte: T_INT,
  word: T_INT, longword: T_INT, cardinal: T_INT, int64: T_INT, qword: T_INT,
  real: T_REAL, double: T_REAL, single: T_REAL, extended: T_REAL, currency: T_REAL,
  boolean: T_BOOL, char: T_CHAR, string: T_STR, shortstring: T_STR,
  ansistring: T_STR, text: T_STR,
};

export function isNum(t) {
  return t.k === 'int' || t.k === 'real' || t.k === 'any';
}
export function isInt(t) {
  return t.k === 'int' || t.k === 'any';
}
export function isOrdinal(t) {
  return t.k === 'int' || t.k === 'char' || t.k === 'bool' || t.k === 'enum' || t.k === 'any';
}
export function isStrLike(t) {
  return t.k === 'str' || t.k === 'char' || t.k === 'any';
}
export function isBool(t) {
  return t.k === 'bool' || t.k === 'any';
}

export function typeName(t) {
  if (!t) return '?';
  switch (t.k) {
    case 'int': return 'Integer';
    case 'real': return 'Real';
    case 'bool': return 'Boolean';
    case 'char': return 'Char';
    case 'str': return 'String';
    case 'void': return 'nada (procedimento)';
    case 'any': return '?';
    case 'enum': return t.name || `(${t.names.join(', ')})`;
    case 'array': return t.name || `array[${t.loLabel}..${t.hiLabel}] of ${typeName(t.elem)}`;
    case 'dynarray': return t.name || `array of ${typeName(t.elem)}`;
    case 'record': return t.name || 'record';
    case 'set': return `set of ${typeName(t.elem)}`;
    default: return t.k;
  }
}

export function sameType(a, b) {
  if (a === b) return true;
  if (a.k === 'any' || b.k === 'any') return true;
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'array':
      return a.lo === b.lo && a.hi === b.hi && sameType(a.elem, b.elem);
    case 'dynarray':
      return sameType(a.elem, b.elem);
    case 'record':
    case 'enum':
      return a === b;
    case 'set':
      return sameType(a.elem, b.elem) || a.elem.k === 'any' || b.elem.k === 'any';
    default:
      return true;
  }
}

/** Pode atribuir valor do tipo src em variável do tipo dst? */
export function assignable(dst, src) {
  if (dst.k === 'any' || src.k === 'any') return true;
  if (dst.k === 'real' && src.k === 'int') return true;
  if (dst.k === 'str' && src.k === 'char') return true;
  if (dst.k === 'set' && src.k === 'set') return true;
  return sameType(dst, src);
}

export function defaultValue(t) {
  switch (t.k) {
    case 'int':
    case 'real':
    case 'enum':
      return 0;
    case 'bool':
      return false;
    case 'char':
      return '\0';
    case 'str':
      return '';
    case 'set':
      return new Set();
    case 'array': {
      const data = new Array(t.hi - t.lo + 1);
      for (let i = 0; i < data.length; i++) data[i] = defaultValue(t.elem);
      return { lo: t.lo, data };
    }
    case 'dynarray':
      return { lo: 0, data: [] };
    case 'record': {
      const o = {};
      for (const [name, ft] of t.fields) o[name] = defaultValue(ft);
      return o;
    }
    default:
      return 0;
  }
}

/** Cópia profunda (semântica de valor do Pascal para arrays/records). */
export function copyValue(v) {
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Set) return new Set(v);
  if (Array.isArray(v.data) && 'lo' in v) {
    return { lo: v.lo, data: v.data.map(copyValue) };
  }
  const o = {};
  for (const k in v) o[k] = copyValue(v[k]);
  return o;
}

/** Converte um valor ordinal em número. */
export function ordOf(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') return v.length ? v.charCodeAt(0) : 0;
  return 0;
}

export function fromOrd(t, n) {
  switch (t.k) {
    case 'char': return String.fromCharCode(n);
    case 'bool': return n !== 0;
    default: return n;
  }
}

