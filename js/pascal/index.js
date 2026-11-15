// Fachada do compilador: código-fonte → AST anotada (ou erros).
import { parseProgram, parseExpression } from './parser.js';
import { analyze } from './analyzer.js';
import { PascalError } from './errors.js';

export { Interpreter, formatValue, fpcReal, displayValue, CRT_COLORS } from './interpreter.js';
export { PascalError, PascalRuntimeError, StopSignal } from './errors.js';
export { tokenize, KEYWORDS } from './lexer.js';
export { parseProgram, parseExpression };

/**
 * Compila um programa Pascal.
 * @returns {{ ok: boolean, ast?: object, errors: PascalError[], warnings: object[] }}
 */
export function compile(src) {
  let ast;
  try {
    ast = parseProgram(src);
  } catch (e) {
    if (e instanceof PascalError) return { ok: false, errors: [e], warnings: [] };
    throw e;
  }
  let res;
  try {
    res = analyze(ast);
  } catch (e) {
    if (e instanceof PascalError) return { ok: false, ast, errors: [e], warnings: [] };
    throw e;
  }
  res.errors.sort((a, b) => a.line - b.line || a.col - b.col);
  return { ok: res.errors.length === 0, ast, errors: res.errors, warnings: res.warnings };
}

