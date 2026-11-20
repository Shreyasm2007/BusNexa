import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const usersFile = path.join(dataDir, "users.json");
const bookingsFile = path.join(dataDir, "bookings.json");
for (const f of [usersFile, bookingsFile]) if (!fs.existsSync(f)) fs.writeFileSync(f, "[]");

const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const seatPlan = _type => Array.from({length:10},(_,i)=>[`${i+1}A`,`${i+1}B`,`${i+1}C`,`${i+1}D`]).flat();
const write = (f, value) => fs.writeFileSync(f, JSON.stringify(value, null, 2));
const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(",") : ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use(express.json());

const SECRET = process.env.JWT_SECRET || "change-this-development-secret-before-deploying";
const tokenFor = (user) => jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: "7d" });

function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ message: "Please log in again." }); }
}

app.get("/api/health", (_req, res) => res.json({ ok: true, mode: "demo", uptimeSeconds: Math.floor(process.uptime()), timestamp: new Date().toISOString() }));

app.post("/api/auth/register", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
  if (password.length < 8) return res.status(400).json({ message: "Password must contain at least 8 characters." });
  const users = read(usersFile);
  if (users.some(u => u.email === email)) return res.status(409).json({ message: "An account with this email already exists." });
  const user = { id: crypto.randomUUID(), email, passwordHash: await bcrypt.hash(password, 12), name: "", phone: "" };
  users.push(user); write(usersFile, users);
  res.status(201).json({ token: tokenFor(user), user: { id: user.id, email: user.email, name: user.name, phone: user.phone } });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = read(usersFile).find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ message: "Invalid email or password." });
  res.json({ token: tokenFor(user), user: { id: user.id, email: user.email, name: user.name, phone: user.phone } });
});

app.get("/api/me", auth, (req, res) => {
  const user = read(usersFile).find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ message: "Account not found." });
  res.json({ id: user.id, email: user.email, name: user.name, phone: user.phone });
});

app.put("/api/me", auth, (req, res) => {
  const users = read(usersFile);
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ message: "Account not found." });
  user.name = String(req.body.name || "").trim().slice(0, 80);
  user.phone = String(req.body.phone || "").trim().slice(0, 20);
  write(usersFile, users);
  res.json({ id: user.id, email: user.email, name: user.name, phone: user.phone });
});

app.get("/api/bookings", auth, (req, res) => {
  res.json(read(bookingsFile).filter(b => b.userId === req.user.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
});

app.get("/api/bookings/seats", auth, (req, res) => {
  const serviceNo = String(req.query.serviceNo || "").trim();
  const date = String(req.query.date || "").trim();
  if (!serviceNo || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: "A service number and travel date are required." });
  const type = String(req.query.busType || "Non-AC Seater");
  const allSeats = seatPlan(type);
  const bookedSeats = [...new Set(read(bookingsFile)
    .filter(b => b.serviceNo === serviceNo && b.date === date && b.status === "Confirmed (demo)")
    .map(b => b.seatNo))];
  const validBookedSeats = bookedSeats.filter(seat => allSeats.includes(seat));
  res.json({ serviceNo, date, busType:type, totalSeats:allSeats.length, bookedSeats:validBookedSeats, availableCount:allSeats.length-validBookedSeats.length });
});

app.post("/api/bookings", auth, (req, res) => {
  const { serviceNo, from, to, date, departure, distanceKm, passengerName, mobile, seatNo, busType, fareAmount, baseFare, reservationFee, gstAmount, convenienceFee, paymentReference, paymentStatus } = req.body;
  if (!(Number(distanceKm) >= 100)) return res.status(400).json({ message: "Online booking is available only for journeys of 100 km or more." });
  if (!String(passengerName || "").trim()) return res.status(400).json({ message: "Enter the passenger name." });
  if (!/^[0-9]{10}$/.test(String(mobile || ""))) return res.status(400).json({ message: "Enter exactly 10 digits for the mobile number." });
  const validSeats = seatPlan(busType);
  if (!validSeats.includes(String(seatNo || ""))) return res.status(400).json({ message: "Please select a valid seat for this coach layout." });
  const departureAt = new Date(`${date}T${departure}:00+05:30`);
  if (Number.isNaN(departureAt.getTime()) || departureAt.getTime() - Date.now() < 3 * 60 * 60 * 1000)
    return res.status(400).json({ message: "Booking closes 3 hours before departure. Online booking is no longer available for this service." });
  const bookings = read(bookingsFile);
  const alreadyTaken = bookings.some(b => b.serviceNo === serviceNo && b.date === date && b.seatNo === seatNo && b.status === "Confirmed (demo)");
  if (alreadyTaken) return res.status(409).json({ message: `Seat ${seatNo} has just been booked. Please choose another seat.` });
  const booking = { busType:String(busType||"Non-AC Seater"), id: "SB" + crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase(), userId: req.user.id, serviceNo, from, to, date, departure, distanceKm: Number(distanceKm), passengerName: String(passengerName).trim().slice(0,80), mobile: String(mobile).trim(), seatNo, fareAmount: Math.max(0, Number(fareAmount) || 0), baseFare: Math.max(0, Number(baseFare) || Number(fareAmount) || 0), reservationFee: Math.max(0, Number(reservationFee) || 0), gstAmount: Math.max(0, Number(gstAmount) || 0), convenienceFee: Math.max(0, Number(convenienceFee) || 0), paymentReference: String(paymentReference || "").slice(0,40), paymentStatus: String(paymentStatus || "Demo only"), status: "Confirmed (demo)", createdAt: new Date().toISOString() };
  bookings.push(booking); write(bookingsFile, bookings);
  res.status(201).json(booking);
});


// Cancellation reference: published KSRTC fee slabs (10% / 25% / 50%); simplified demo implementation.
app.post("/api/bookings/:id/cancel", auth, (req, res) => {
  const bookings = read(bookingsFile);
  const booking = bookings.find(b => b.id === req.params.id && b.userId === req.user.id);
  if (!booking) return res.status(404).json({ message: "Booking not found." });
  if (booking.status !== "Confirmed (demo)") return res.status(409).json({ message: "This booking is already cancelled or is not active." });
  const departureAt = new Date(`${booking.date}T${booking.departure}:00+05:30`);
  const hoursLeft = (departureAt.getTime() - Date.now()) / 3600000;
  if (!Number.isFinite(hoursLeft) || hoursLeft <= 0) return res.status(400).json({ message: "This journey has already departed." });
  const noRefund = hoursLeft < 2;
  const deductionPercent = noRefund ? 100 : hoursLeft >= 72 ? 10 : hoursLeft >= 24 ? 25 : 50;
  const refundPercent = noRefund ? 0 : 100 - deductionPercent;
  const baseFare = Number(booking.baseFare ?? booking.fareAmount ?? 0);
  const reservationFee = Number(booking.reservationFee || 0);
  const refundAmount = noRefund ? 0 : Math.max(0, Math.round(Number(booking.fareAmount || 0) - baseFare * deductionPercent / 100 - reservationFee));
  booking.status = "Cancelled";
  booking.cancelledAt = new Date().toISOString();
  booking.cancellationHoursBeforeDeparture = Number(hoursLeft.toFixed(2));
  booking.cancellationDeductionPercent = deductionPercent;
  booking.refundPercent = refundPercent;
  booking.refundAmount = refundAmount;
  booking.refundStatus = refundAmount > 0 ? "Marked as transferred to bank account (demo status only; no real transfer)" : "No refund — cancellation within 2 hours";
  write(bookingsFile, bookings);
  res.json({ booking, seatReleased: true });
});

const PORT = Number(process.env.PORT || 5000);
const server = app.listen(PORT, () => console.log(`NightRoute API running at http://localhost:${PORT}`));
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.on("error", error => { console.error("NightRoute API failed to start:", error); process.exitCode = 1; });
