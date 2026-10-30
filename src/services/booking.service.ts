import { bookings, nextBookingId, tickets } from "../data/store";
import { AppError } from "../errors";
import type { Booking } from "../types";
import { calculateDiscount } from "./discount";

// Must stay synchronous: check stock and decrement in the same tick so concurrent requests can't oversell.
export function createBooking(ticketId: number, quantity: number): Booking {
  // The route validates too; this guard keeps a bad caller from adding stock back (stock -= -2).
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError(400, "VALIDATION_ERROR", "quantity must be a positive integer");
  }

  const ticket = tickets.find((t) => t.id === ticketId);
  if (!ticket) {
    throw new AppError(404, "TICKET_NOT_FOUND", `Ticket ${ticketId} not found`);
  }

  if (quantity > ticket.stock) {
    throw new AppError(
      409,
      "INSUFFICIENT_STOCK",
      `Only ${ticket.stock} ticket(s) left, requested ${quantity}`,
    );
  }

  ticket.stock -= quantity;

  // Price always comes from the server-side ticket, never from the client.
  const totalAmount = ticket.price * quantity;
  const discountAmount = calculateDiscount(totalAmount);

  const booking: Booking = {
    id: nextBookingId(),
    ticketId: ticket.id,
    quantity,
    unitPrice: ticket.price,
    totalAmount,
    discountAmount,
    finalAmount: totalAmount - discountAmount,
    status: "CONFIRMED",
    createdAt: new Date(),
  };
  bookings.push(booking);

  return booking;
}
