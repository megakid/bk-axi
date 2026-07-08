export type ErrorCode =
  | "AUTH_REQUIRED"
  | "BK_NOT_INSTALLED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "UNKNOWN"
  | "USAGE"
  | "VALIDATION_ERROR";

export class AxiError extends Error {
  readonly code: ErrorCode;
  readonly suggestions: string[];
  readonly usage: boolean;

  constructor(
    message: string,
    code: ErrorCode = "UNKNOWN",
    suggestions: string[] = [],
  ) {
    super(message);
    this.name = "AxiError";
    this.code = code;
    this.suggestions = suggestions;
    this.usage = code === "USAGE" || code === "VALIDATION_ERROR";
  }
}

export function exitCodeForError(error: unknown): 1 | 2 {
  if (error instanceof AxiError && error.usage) {
    return 2;
  }
  return 1;
}

export function toAxiError(error: unknown): AxiError {
  if (error instanceof AxiError) {
    return error;
  }
  if (error instanceof Error) {
    return new AxiError(error.message || "Unexpected error", "UNKNOWN");
  }
  return new AxiError("Unexpected error", "UNKNOWN");
}

export function firstUsefulLine(output: string): string {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("Usage:")) ?? "";
}
