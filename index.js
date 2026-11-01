import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

const app = express();

const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || "spotlight-dev-secret";
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const TOKEN_COOKIE = "spotlight_token";
const isProduction = process.env.NODE_ENV === "production";

// Credentials are required so the HTTPOnly JWT cookie can travel between the
// Next.js client (port 3000) and this API (port 8000).
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: CLIENT_URL.split(",").map((url) => url.trim()).filter(Boolean),
    credentials: true,
  }),
);

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    throw err;
  }
}
const db = client.db("spotlight");
const studiosCollection = db.collection("studios");
const bookingsCollection = db.collection("bookings");
const wishlistsCollection = db.collection("wishlists");

connectToMongoDB();

// ==========================================
// Challenge 1: JWT stored in an HTTPOnly cookie
// ==========================================

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

const requireAuth = (req, res, next) => {
  const token = req.cookies?.[TOKEN_COOKIE];

  if (!token) {
    return res
      .status(401)
      .json({ message: "Unauthorized. Please log in before continuing." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      email: String(payload.email ?? "").trim().toLowerCase(),
      name: String(payload.name ?? "").trim(),
    };
    return next();
  } catch {
    return res
      .status(401)
      .json({ message: "Unauthorized. Your session has expired." });
  }
};

const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();

const ownsStudio = (studio, user) => {
  const owner = normalizeEmail(studio?.ownerEmail || studio?.hostEmail);
  return Boolean(owner) && owner === user.email;
};

// Issues the HTTPOnly JWT after the client authenticates with Better Auth.
app.post("/jwt", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const name = String(req.body?.name ?? "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res
      .status(400)
      .json({ message: "A valid user email is required to issue a token." });
  }

  const token = jwt.sign({ email, name }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie(TOKEN_COOKIE, token, cookieOptions);

  return res.json({ success: true, user: { email, name } });
});

app.post("/jwt/logout", (req, res) => {
  res.clearCookie(TOKEN_COOKIE, { ...cookieOptions, maxAge: undefined });
  return res.json({ success: true });
});

// Test API
app.get("/", (req, res) => {
  res.send("Backend Server is Running!");
});

// ==========================================
// Studio APIs
// ==========================================

app.post("/add-new-studio", requireAuth, async (req, res) => {
  try {
    const data = { ...req.body };
    delete data._id;

    const newStudio = {
      ...data,
      hostName: req.user.name || data.hostName || "SpotLight Host",
      hostEmail: req.user.email,
      ownerEmail: req.user.email,
      createdAt: new Date(),
    };

    const result = await studiosCollection.insertOne(newStudio);
    res.status(201).send(result);
  } catch (error) {
    console.error("Add studio error:", error);
    res.status(500).send({ message: "Failed to add studio." });
  }
});

app.get("/all-studio", async (req, res) => {
  try {
    const result = await studiosCollection.find().toArray();
    res.send(result);
  } catch (error) {
    console.error("Get studios error:", error);
    res.status(500).send({ message: "Failed to fetch studios." });
  }
});

app.get("/all-studio/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await studiosCollection.findOne({ _id: new ObjectId(id) });
    if (!result) return res.status(404).send({ message: "Studio not found." });
    res.send(result);
  } catch (error) {
    res.status(400).send({ message: "Invalid studio ID." });
  }
});

app.delete("/all-studio/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const studio = await studiosCollection.findOne({ _id: new ObjectId(id) });

    if (!studio) return res.status(404).json({ message: "Studio not found." });
    if (!ownsStudio(studio, req.user)) {
      return res
        .status(403)
        .json({ message: "You can only delete your own studio listings." });
    }

    const result = await studiosCollection.deleteOne({ _id: new ObjectId(id) });
    // Keep wishlists clean so no orphaned saves point at a deleted studio.
    await wishlistsCollection.deleteMany({ studioId: String(id) });
    res.send(result);
  } catch (error) {
    res.status(400).send({ message: "Failed to delete studio." });
  }
});

app.patch("/all-studio/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const studio = await studiosCollection.findOne({ _id: new ObjectId(id) });

    if (!studio) return res.status(404).json({ message: "Studio not found." });
    if (!ownsStudio(studio, req.user)) {
      return res
        .status(403)
        .json({ message: "You can only update your own studio listings." });
    }

    const updates = { ...req.body };
    delete updates._id;
    // Ownership can never be transferred through an update body.
    delete updates.ownerEmail;
    delete updates.hostEmail;

    const result = await studiosCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } },
    );
    res.send(result);
  } catch (error) {
    res.status(400).send({ message: "Studio could not be updated." });
  }
});

app.get("/featured-studio", async (req, res) => {
  try {
    const result = await studiosCollection
      .find()
      .sort({ rating: -1, createdAt: -1 })
      .limit(6)
      .toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch featured studios." });
  }
});

// ==========================================
// Wishlist APIs (MongoDB-backed favourites)
// ==========================================

// Returns every studio the signed-in user has saved.
app.get("/wishlist", requireAuth, async (req, res) => {
  try {
    const wishlist = await wishlistsCollection
      .find({ userEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(wishlist);
  } catch (error) {
    console.error("Get wishlist error:", error);
    res.status(500).json({ message: "Failed to fetch your wishlist." });
  }
});

// Toggles a studio in the signed-in user's wishlist.
app.post("/wishlist", requireAuth, async (req, res) => {
  try {
    const studioId = String(req.body?.studioId ?? "").trim();

    if (!ObjectId.isValid(studioId)) {
      return res.status(400).json({ message: "Invalid studio ID." });
    }

    const studio = await studiosCollection.findOne({
      _id: new ObjectId(studioId),
    });
    if (!studio) {
      return res.status(404).json({ message: "Studio not found." });
    }

    const filter = { userEmail: req.user.email, studioId };
    const existing = await wishlistsCollection.findOne(filter);

    if (existing) {
      await wishlistsCollection.deleteOne({ _id: existing._id });
      return res.json({ saved: false, studioId });
    }

    await wishlistsCollection.insertOne({
      ...filter,
      createdAt: new Date(),
    });
    return res.status(201).json({ saved: true, studioId });
  } catch (error) {
    console.error("Toggle wishlist error:", error);
    res.status(500).json({ message: "Failed to update your wishlist." });
  }
});

// ==========================================
// Booking APIs (with Double-Booking Prevention)
// ==========================================

// Returns minutes since midnight, or null when the value is not HH:MM.
const toMinutes = (value) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
};

// Create a new booking
app.post("/bookings", requireAuth, async (req, res) => {
  try {
    const { studioId, bookingDate, startTime, endTime, customerName } = req.body;

    if (!studioId || !bookingDate || !startTime || !endTime) {
      return res
        .status(400)
        .json({ message: "Missing required booking details." });
    }

    let studio;
    try {
      studio = await studiosCollection.findOne({ _id: new ObjectId(studioId) });
    } catch {
      return res.status(400).json({ message: "Invalid studio ID." });
    }
    if (!studio) {
      return res.status(404).json({ message: "Studio not found." });
    }

    const startMinutes = toMinutes(startTime);
    const endMinutes = toMinutes(endTime);

    if (startMinutes === null || endMinutes === null) {
      return res
        .status(400)
        .json({ message: "Start time and end time must use the HH:MM format." });
    }
    if (endMinutes <= startMinutes) {
      return res
        .status(400)
        .json({ message: "End time must be later than the start time." });
    }

    // Challenge 2: Double-Booking Prevention
    const existingBookings = await bookingsCollection
      .find({
        studioId: String(studioId),
        bookingDate: String(bookingDate),
        status: { $in: ["Confirmed", "Pending"] },
      })
      .toArray();

    const isOverlapping = existingBookings.some((booking) => {
      const existingStart = toMinutes(booking.startTime);
      const existingEnd = toMinutes(booking.endTime);

      if (existingStart === null || existingEnd === null) return false;

      // Time overlap rule: startA < endB && endA > startB
      return startMinutes < existingEnd && endMinutes > existingStart;
    });

    if (isOverlapping) {
      return res.status(409).json({
        message:
          "This time slot is already reserved for this studio. Please choose another time or date.",
      });
    }

    const totalHours = (endMinutes - startMinutes) / 60;
    // Never trust prices sent by the browser - recompute from the studio doc.
    const hourlyRate = Number(studio.hourlyRate ?? studio.rate ?? 0);
    const securityDeposit = Number(
      studio.securityDeposit ?? studio.deposit ?? 0,
    );
    const totalPrice = Math.round(totalHours * hourlyRate * 100) / 100;

    const newBooking = {
      studioId: String(studioId),
      studioTitle: studio.title || "Studio Space",
      hostName: studio.hostName || studio.host?.name || "Host",
      hostEmail: normalizeEmail(studio.hostEmail || studio.ownerEmail),
      customerName:
        String(customerName ?? "").trim() || req.user.name || "Guest Creator",
      customerEmail: req.user.email,
      bookingDate: String(bookingDate),
      startTime: String(startTime),
      endTime: String(endTime),
      totalHours,
      hourlyRate,
      securityDeposit,
      totalPrice,
      status: "Pending",
      createdAt: new Date(),
    };

    const result = await bookingsCollection.insertOne(newBooking);
    res.status(201).json({
      message: "Booking request submitted successfully.",
      insertedId: result.insertedId,
      booking: { ...newBooking, _id: result.insertedId },
    });
  } catch (error) {
    console.error("Booking creation error:", error);
    res.status(500).json({ message: "Failed to create booking." });
  }
});

// Get bookings owned by the signed-in user (as guest or as host)
app.get("/bookings", requireAuth, async (req, res) => {
  try {
    const { hostEmail } = req.query;
    const query = hostEmail
      ? { hostEmail: req.user.email }
      : { customerEmail: req.user.email };

    const bookings = await bookingsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();
    res.json(bookings);
  } catch (error) {
    console.error("Get bookings error:", error);
    res.status(500).json({ message: "Failed to fetch bookings." });
  }
});

// Cancel a pending booking
app.patch("/bookings/:id/cancel", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found." });
    }
    if (normalizeEmail(booking.customerEmail) !== req.user.email) {
      return res
        .status(403)
        .json({ message: "You can only cancel your own bookings." });
    }
    if (booking.status !== "Pending") {
      return res.status(400).json({
        message: `Only pending bookings can be cancelled. Current status is ${booking.status}.`,
      });
    }

    const result = await bookingsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "Cancelled", cancelledAt: new Date() } },
    );
    res.json({ message: "Booking cancelled successfully.", result });
  } catch (error) {
    console.error("Cancel booking error:", error);
    res.status(500).json({ message: "Failed to cancel booking." });
  }
});

// Update status (host confirms or completes a reservation)
app.patch("/bookings/:id/status", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ["Pending", "Confirmed", "Completed", "Cancelled"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value." });
    }

    const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
    if (!booking) {
      return res.status(404).json({ message: "Booking not found." });
    }
    if (normalizeEmail(booking.hostEmail) !== req.user.email) {
      return res.status(403).json({
        message: "Only the studio host can change the booking status.",
      });
    }

    const result = await bookingsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } },
    );
    res.json({ message: `Booking status updated to ${status}.`, result });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({ message: "Failed to update status." });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
