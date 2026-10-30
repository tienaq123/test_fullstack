export type ErrorCode =
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
  | "TICKET_NOT_FOUND"
  | "INSUFFICIENT_STOCK"
  | "INTERNAL_ERROR";

// Expected business/input error. Thrown anywhere, turned into an HTTP response by the error handler.
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}
