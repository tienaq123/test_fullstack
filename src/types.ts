export interface Ticket {
  id: number;
  name: string;
  price: number; // VND, integer
  stock: number;
}

export type BookingStatus = "CONFIRMED";

export interface Booking {
  id: string;
  ticketId: number;
  quantity: number;
  unitPrice: number; // price snapshot at purchase time
  totalAmount: number;
  status: BookingStatus;
  createdAt: Date;
}
