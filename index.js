import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();

const PORT = process.env.PORT || 8000;

const CLIENT_ORIGINS = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((url) => url.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const BETTER_AUTH_ORIGIN = CLIENT_ORIGINS[0];

app.use(express.json());
app.use(
  cors({
    origin: CLIENT_ORIGINS,
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

const client = new MongoClient(process.env.MONGODB_URI);
let mongoConnection;

export async function connectToMongoDB() {
  if (!mongoConnection) {
    mongoConnection = client.connect().catch((error) => {
      mongoConnection = undefined;
      console.error("MongoDB connection failed:", error);
      throw error;
    });
  }
  return mongoConnection;
}
const db = client.db("spotlight");
const studiosCollection = db.collection("studios");
const bookingsCollection = db.collection("bookings");

// Verify Better Auth JWKS

const normalizeEmail = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const BETTER_AUTH_JWKS = createRemoteJWKSet(
  new URL("/api/auth/jwks", BETTER_AUTH_ORIGIN),
);

const requireAuth = async (req, res, next) => {
  const [scheme, token] = String(req.headers.authorization ?? "").split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return res.status(401).json({
      message: "Unauthorized.",
    });
  }

  try {
    const { payload } = await jwtVerify(token, BETTER_AUTH_JWKS, {
      issuer: BETTER_AUTH_ORIGIN,
      audience: BETTER_AUTH_ORIGIN,
    });

    const email = normalizeEmail(payload.email);
    if (!email) {
      return res.status(401).json({
        message: "Unauthorized. The token is missing an email claim.",
      });
    }

    req.user = {
      id: String(payload.sub ?? ""),
      email,
      name: String(payload.name ?? "").trim(),
    };
    return next();
  } catch {
    return res.status(401).json({
      message: "Unauthorized. The token is invalid or has expired.",
    });
  }
};

const ownsStudio = (studio, user) =>
  normalizeEmail(studio?.ownerEmail || studio?.hostEmail) === user.email;

// Test API
app.get("/", (req, res) => {
  res.send("Backend Server is Running...!");
});

app.use(async (req, res, next) => {
  try {
    await connectToMongoDB();
    next();
  } catch (error) {
    console.error("Database unavailable:", error);
    res.status(503).json({ message: "Database unavailable." });
  }
});

// ===========
// Studio APIs
// ===========

app.post("/add-new-studio", requireAuth, async (req, res) => {
  const data = {
    ...req.body,
    hostEmail: req.user.email,
    ownerEmail: req.user.email,
  };
  delete data._id;
  const result = await studiosCollection.insertOne(data);
  res.send(result);
});

app.get("/all-studio", async (req, res) => {
  const result = await studiosCollection.find().toArray();
  res.send(result);
});

app.get("/all-studio/:id", async (req, res) => {
  const { id } = req.params;
  const result = await studiosCollection.findOne({ _id: new ObjectId(id) });
  res.send(result);
});

app.delete("/all-studio/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const studio = await studiosCollection.findOne({ _id: new ObjectId(id) });
  if (!studio || !ownsStudio(studio, req.user)) return res.sendStatus(403);

  const result = await studiosCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

app.patch("/all-studio/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const studio = await studiosCollection.findOne({ _id: new ObjectId(id) });
  if (!studio || !ownsStudio(studio, req.user)) return res.sendStatus(403);

  const updates = { ...req.body };
  delete updates._id;
  delete updates.ownerEmail;
  delete updates.hostEmail;
  const result = await studiosCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updates },
  );
  res.send(result);
});

app.get("/featured-studio", async (req, res) => {
  const result = await studiosCollection
    .find()
    .sort({ rating: -1, createdAt: -1 })
    .limit(6)
    .toArray();
  res.send(result);
});

app.get("/availability", async (req, res) => {
  const studioId = String(req.query.studioId ?? "");
  const bookingDate = String(req.query.bookingDate ?? "");
  if (!studioId || !bookingDate) return res.sendStatus(400);

  const bookings = await bookingsCollection
    .find(
      {
        studioId,
        bookingDate,
        status: { $in: ["Pending", "Confirmed"] },
      },
      { projection: { _id: 0, startTime: 1, endTime: 1 } },
    )
    .toArray();
  res.send(bookings);
});

// Booking APIs (with Double-Booking Prevention)

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
    const { studioId, bookingDate, startTime, endTime, customerName } =
      req.body;

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
      return res.status(400).json({
        message: "Start time and end time must use the HH:MM format.",
      });
    }
    if (endMinutes <= startMinutes) {
      return res
        .status(400)
        .json({ message: "End time must be later than the start time." });
    }

    // Double-Booking Prevention
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

      return startMinutes < existingEnd && endMinutes > existingStart;
    });

    if (isOverlapping) {
      return res.status(409).json({
        message:
          "This time slot is already reserved for this studio. Please choose another time or date.",
      });
    }

    const totalHours = (endMinutes - startMinutes) / 60;

    const hourlyRate = Number(studio.hourlyRate ?? studio.rate ?? 0);
    const securityDeposit = Number(
      studio.securityDeposit ?? studio.deposit ?? 0,
    );
    const totalPrice = Math.round(totalHours * hourlyRate * 100) / 100;

    const newBooking = {
      studioId: String(studioId),
      studioTitle: studio.title,
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

app.get("/bookings", requireAuth, async (req, res) => {
  const { hostEmail } = req.query;
  const query = hostEmail
    ? { hostEmail: req.user.email }
    : { customerEmail: req.user.email };

  const bookings = await bookingsCollection
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();
  res.send(bookings);
});

// Cancel a pending booking
app.patch("/bookings/:id/cancel", requireAuth, async (req, res) => {
  const { id } = req.params;
  const result = await bookingsCollection.updateOne(
    {
      _id: new ObjectId(id),
      customerEmail: req.user.email,
      status: "Pending",
    },
    { $set: { status: "Cancelled", cancelledAt: new Date() } },
  );

  if (!result.matchedCount) return res.sendStatus(403);
  res.send(result);
});

// Update status (host confirms or completes a reservation)
app.patch("/bookings/:id/status", requireAuth, async (req, res) => {
  const { id } = req.params;
  const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
  if (!booking || normalizeEmail(booking.hostEmail) !== req.user.email)
    return res.sendStatus(403);
  const nextStatus = req.body.status;
  const currentStatus =
    nextStatus === "Confirmed"
      ? "Pending"
      : nextStatus === "Completed"
        ? "Confirmed"
        : null;
  if (!currentStatus || booking.status !== currentStatus)
    return res.sendStatus(400);

  const result = await bookingsCollection.updateOne(
    { _id: new ObjectId(id), status: currentStatus },
    { $set: { status: nextStatus, updatedAt: new Date() } },
  );
  res.send(result);
});

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
