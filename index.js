import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();

const PORT = process.env.PORT || 8000;

const CLIENT_ORIGINS = process.env.CLIENT_URL || "http://localhost:3000";

app.use(express.json());

app.use(
  cors({
    origin: CLIENT_ORIGINS,
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const db = client.db("spotlight");
const studiosCollection = db.collection("studios");
const bookingsCollection = db.collection("bookings");
const newsletterSubscriptionsCollection = db.collection(
  "newsletterSubscriptions",
);

const normalizeEmail = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

// Verify Better Auth JWKS

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ msg: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ msg: "Unauthorized" });
  }

  const JWKS = createRemoteJWKSet(new URL(`${CLIENT_ORIGINS}/api/auth/jwks`));

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.authPayload = payload;
  } catch (error) {
    return res.status(401).send({ msg: "Server Error (token issue)" });
  }

  next();
};

//Token এর ভিতর থেকে ইউজার বের করা

const verifyUser = (req, res, next) => {
  const payload = req.authPayload;
  const email = normalizeEmail(payload?.email);

  if (!email) {
    return res.status(401).send({ msg: "Unauthorized" });
  }

  req.user = {
    id: String(payload.sub ?? ""),
    email,
    name: String(payload.name ?? "").trim(),
  };
  return next();
};

const ownsStudio = (studio, user) =>
  normalizeEmail(studio?.ownerEmail) === user.email;

// Test API
app.get("/", (req, res) => {
  res.send("Backend Server is Running...!");
});

connectToMongoDB();

// ===========
// Studio APIs
// ===========

app.post("/api/studios", verifyToken, verifyUser, async (req, res) => {
  const data = {
    ...req.body,
    ownerName: req.user.name,
    ownerEmail: req.user.email,
  };
  delete data._id;
  const result = await studiosCollection.insertOne(data);
  res.send(result);
});

// সব স্টুডিও
app.get("/api/studios", async (req, res) => {
  const result = await studiosCollection.find().toArray();
  res.send(result);
});

//হোম পেজ এর ফিচার সেকশনের স্টুডিও
app.get("/api/studios/featured", async (req, res) => {
  const result = await studiosCollection
    .find()
    .sort({ rating: -1, createdAt: -1 })
    .limit(6)
    .toArray();
  res.send(result);
});

// একটি নির্দিষ্ট স্টুডিও
app.get("/api/studios/:id", async (req, res) => {
  const { id } = req.params;
  const result = await studiosCollection.findOne({ _id: new ObjectId(id) });
  if (!result) return res.status(404).send({ msg: "Studio not found" });
  res.send(result);
});

// স্টুডিও ডিলিট করা
app.delete("/api/studios/:id", verifyToken, verifyUser, async (req, res) => {
  const { id } = req.params;
  const studio = await studiosCollection.findOne({ _id: new ObjectId(id) });
  if (!studio || !ownsStudio(studio, req.user)) return res.sendStatus(403);

  const result = await studiosCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// স্টুডিও এডিট করা
app.patch("/api/studios/:id", verifyToken, verifyUser, async (req, res) => {
  const { id } = req.params;
  const studio = await studiosCollection.findOne({ _id: new ObjectId(id) });
  if (!studio || !ownsStudio(studio, req.user)) return res.sendStatus(403);

  const updates = { ...req.body };
  delete updates._id;
  delete updates.ownerEmail;
  delete updates.ownerName;

  const result = await studiosCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updates },
  );
  res.send(result);
});

//বুক করা আছে কি নেই তা খুঁজে বের করা
app.get("/api/bookings/availability", async (req, res) => {
  const { studioId, bookingDate } = req.query;

  if (!studioId || !bookingDate) return res.sendStatus(400);

  const query = {
    studioId: studioId,
    bookingDate: bookingDate,
    status: { $ne: "Cancelled" },
  };

  const bookings = await bookingsCollection.find(query).toArray();

  res.send(bookings);
});

// Booking APIs (with Double-Booking Prevention)
const toMinutes = (timeString) => {
  if (!timeString) return null;

  const parts = timeString.split(":");
  if (parts.length !== 2) return null;

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  return hours * 60 + minutes;
};

// Create a new booking
app.post("/api/bookings", verifyToken, verifyUser, async (req, res) => {
  try {
    const { studioId, bookingDate, startTime, endTime, customerName } =
      req.body;

    if (!studioId || !bookingDate || !startTime || !endTime) {
      return res
        .status(400)
        .json({ message: "Missing required booking details." });
    }

    const studio = await studiosCollection.findOne({
      _id: new ObjectId(studioId),
    });
    if (!studio) {
      return res.status(404).send({ message: "Studio not Found" });
    }

    const startMinutes = toMinutes(startTime);
    const endMinutes = toMinutes(endTime);

    if (
      startMinutes === null ||
      endMinutes === null ||
      endMinutes <= startMinutes
    ) {
      return res.status(400).json({
        message:
          "Start time and end time must use the HH:MM format and End time must be later than the start time",
      });
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

    const hourlyRate = Number(studio.hourlyRate || studio.rate || 0);
    const securityDeposit = Number(
      studio.securityDeposit || studio.deposit || 0,
    );
    const totalPrice = Number((totalHours * hourlyRate).toFixed(2));

    const newBooking = {
      studioId: String(studioId),
      studioTitle: studio.title,
      ownerName: studio.ownerName || "Studio Owner",
      ownerEmail: normalizeEmail(studio.ownerEmail),
      customerName: String(customerName || req.user.name),
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

//লগইন করা ইউজারের  বুকিংয়ের তালিকা দেখা
app.get("/api/bookings", verifyToken, verifyUser, async (req, res) => {
  const { ownerEmail } = req.query;
  const query = ownerEmail
    ? { ownerEmail: req.user.email }
    : { customerEmail: req.user.email };

  const bookings = await bookingsCollection
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();
  res.send(bookings);
});

// Cancel a pending booking
app.patch(
  "/api/bookings/:id/cancel",
  verifyToken,
  verifyUser,
  async (req, res) => {
    const { id } = req.params;
    const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });

    if (!booking || booking.customerEmail !== req.user.email) {
      return res.sendStatus(403);
    }

    if (booking.status !== "Pending") {
      return res.sendStatus(400);
    }

    const result = await bookingsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "Cancelled" } },
    );

    res.send(result);
  },
);

// Update status (the owner confirms or completes a reservation)
app.patch(
  "/api/bookings/:id/status",
  verifyToken,
  verifyUser,
  async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });

    if (!booking) {
      return res.status(404).send({ message: "Booking not Found" });
    }

    if (!["Confirmed", "Completed"].includes(status)) {
      return res.status(400).json({ message: "Invalid booking status." });
    }

    if (booking.ownerEmail !== req.user.email) {
      return res.status(403).send({ message: "Unauthorized" });
    }

    if (status === "Confirmed" && booking.status !== "Pending") {
      return res
        .status(400)
        .send({ message: "Only pending bookings can confirmed." });
    }

    if (status === "Completed" && booking.status !== "Confirmed") {
      return res
        .status(400)
        .send({ message: "Only confirmed booking can complete." });
    }

    const result = await bookingsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: status, updatedAt: new Date() } },
    );

    res.send(result);
  },
);

app.post("/api/newsletter", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ message: "Enter a valid email address." });
  }

  const result = await newsletterSubscriptionsCollection.insertOne({
    email,
    createdAt: new Date(),
  });
  res.status(201).json({
    message: "Thank you for subscribing.",
    result,
  });
});

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
