import type { ErrorRequestHandler, Response } from "express";
import { AppError, type ErrorCode } from "../errors";

function sendError(res: Response, status: number, code: ErrorCode, message: string) {
  res.status(status).json({ error: { code, message } });
}

// Single place that turns any thrown error into the shared error response format.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    sendError(res, err.status, err.code, err.message);
    return;
  }

  // Thrown by express.json() when the body is malformed JSON
  if (err?.type === "entity.parse.failed") {
    sendError(res, 400, "INVALID_JSON", "Request body is not valid JSON");
    return;
  }

  console.error(err);
  sendError(res, 500, "INTERNAL_ERROR", "Internal server error");
};
