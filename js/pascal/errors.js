// Erros de compilação e de execução.
export class PascalError extends Error {
  constructor(message, line, col, hint) {
    super(message);
    this.name = 'PascalError';
    this.line = line || 0;
    this.col = col || 0;
    this.hint = hint || '';
    this.kind = 'compile';
  }
}

export class PascalRuntimeError extends Error {
  constructor(message, line, code, hint) {
    super(message);
    this.name = 'PascalRuntimeError';
    this.line = line || 0;
    this.code = code || 0;
    this.hint = hint || '';
    this.kind = 'runtime';
  }
}

export class StopSignal extends Error {
  constructor(reason = 'stop') {
    super(reason);
    this.reason = reason;
  }
}

