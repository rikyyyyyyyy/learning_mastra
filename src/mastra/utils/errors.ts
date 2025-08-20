export class InvalidInputError extends Error {
  readonly name = 'InvalidInputError';
  constructor(message: string) {
    super(message);
  }
}

export class ExternalServiceError extends Error {
  readonly name = 'ExternalServiceError';
  constructor(message: string, public readonly service?: string) {
    super(message);
  }
}

export class StateError extends Error {
  readonly name = 'StateError';
  constructor(message: string) {
    super(message);
  }
}

export class DatabaseError extends Error {
  readonly name = 'DatabaseError';
  constructor(message: string) {
    super(message);
  }
}

export type ErrorClassification = 'invalid-input' | 'external-service' | 'state' | 'database' | 'unknown';

export function classifyError(err: unknown): ErrorClassification {
  if (err instanceof InvalidInputError) return 'invalid-input';
  if (err instanceof ExternalServiceError) return 'external-service';
  if (err instanceof StateError) return 'state';
  if (err instanceof DatabaseError) return 'database';
  return 'unknown';
}

