// Semântica de operadores, compartilhada entre o avaliador de constantes e o interpretador.
import { PascalRuntimeError } from './errors.js';
import { ordOf } from './types.js';

function toInt32(n) {
  return n | 0;
}

/**
 * Aplica um operador binário. `ty` é o tipo resultante calculado pelo analisador
 * e `lt`/`rt` os tipos dos operandos.
 */
export function binop(op, a, b, lt, rt, line) {
  switch (op) {
    case '+':
      if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b);
      return a + b;
    case '-':
      if (a instanceof Set) {
        const s = new Set(a);
        for (const x of b) s.delete(x);
        return s;
      }
      return a - b;
    case '*':
      if (a instanceof Set) return new Set([...a].filter((x) => b.has(x)));
      return a * b;
    case '/':
      if (b === 0) {
        if (a === 0 || lt.k === 'real' || rt.k === 'real') {
          throw new PascalRuntimeError('Divisão por zero', line, 200,
            'O divisor de uma divisão não pode ser zero. Verifique o valor antes de dividir.');
        }
        throw new PascalRuntimeError('Divisão por zero', line, 200,
          'O divisor de uma divisão não pode ser zero. Verifique o valor antes de dividir.');
      }
      return a / b;
    case 'div':
      if (b === 0) {
        throw new PascalRuntimeError('Divisão por zero (div)', line, 200,
          "O divisor de 'div' não pode ser zero.");
      }
      return Math.trunc(a / b);
    case 'mod':
      if (b === 0) {
        throw new PascalRuntimeError('Divisão por zero (mod)', line, 200,
          "O divisor de 'mod' não pode ser zero.");
      }
      return a % b;
    case 'and':
      if (typeof a === 'boolean') return a && b;
      return toInt32(a & b);
    case 'or':
      if (typeof a === 'boolean') return a || b;
      return toInt32(a | b);
    case 'xor':
      if (typeof a === 'boolean') return a !== b;
      return toInt32(a ^ b);
    case 'shl':
      return toInt32(a << b);
    case 'shr':
      return a >>> b;
    case '=':
      return equals(a, b);
    case '<>':
      return !equals(a, b);
    case '<':
      if (a instanceof Set) return subset(a, b) && a.size < b.size;
      return cmp(a, b) < 0;
    case '>':
      return cmp(a, b) > 0;
    case '<=':
      if (a instanceof Set) return subset(a, b);
      return cmp(a, b) <= 0;
    case '>=':
      if (a instanceof Set) return subset(b, a);
      return cmp(a, b) >= 0;
    case 'in':
      return b.has(ordOf(a));
    case '+set': {
      const s = new Set(a);
      for (const x of b) s.add(x);
      return s;
    }
    default:
      throw new PascalRuntimeError(`Operador desconhecido ${op}`, line);
  }
}

function subset(a, b) {
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function equals(a, b) {
  if (a instanceof Set && b instanceof Set) return a.size === b.size && subset(a, b);
  return a === b;
}

function cmp(a, b) {
  if (typeof a === 'boolean') a = a ? 1 : 0;
  if (typeof b === 'boolean') b = b ? 1 : 0;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function unop(op, v) {
  switch (op) {
    case '-':
      return -v;
    case '+':
      return v;
    case 'not':
      if (typeof v === 'boolean') return !v;
      return ~v;
    default:
      return v;
  }
}

