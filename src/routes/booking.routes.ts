import { Router } from "express";
import { AppError } from "../errors";
import { createBooking } from "../services/booking.service";

export const bookingRouter = Router();

// Strict: rejects "2", 1.5, 0, -1, null, NaN. No type coercion.
function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

bookingRouter.post("/", (req, res) => {
  // req.body is undefined when the request has no JSON body
  const { ticketId, quantity } = req.body ?? {};

  if (!isPositiveInteger(ticketId)) {
    throw new AppError(400, "VALIDATION_ERROR", "ticketId must be a positive integer");
  }
  if (!isPositiveInteger(quantity)) {
    throw new AppError(400, "VALIDATION_ERROR", "quantity must be a positive integer");
  }

  const booking = createBooking(ticketId, quantity);

  res.status(201).json({
    bookingId: booking.id,
    totalAmount: booking.totalAmount,
    status: booking.status,
  });
});
