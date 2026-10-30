import express from "express";
import { errorHandler } from "./middlewares/error-handler";
import { bookingRouter } from "./routes/booking.routes";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/bookings", bookingRouter);

// Must be registered after all routes
app.use(errorHandler);
