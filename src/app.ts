import path from "node:path";
import express from "express";
import { errorHandler } from "./middlewares/error-handler";
import { bookingRouter } from "./routes/booking.routes";

export const app = express();

app.use(express.json());

// Simple test UI at http://localhost:3000
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/bookings", bookingRouter);

// Must be registered after all routes
app.use(errorHandler);
