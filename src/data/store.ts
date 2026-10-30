import type { Booking, Ticket } from "../types";

export const tickets: Ticket[] = [
  { id: 1, name: "Vé VinWonders", price: 750000, stock: 5 },
  { id: 2, name: "Vé Safari", price: 650000, stock: 3 },
];

export const bookings: Booking[] = [];

let bookingSeq = 0;

// BK001, BK002, ... (grows past 3 digits after 999, never truncated)
export function nextBookingId(): string {
  bookingSeq += 1;
  return `BK${String(bookingSeq).padStart(3, "0")}`;
}
