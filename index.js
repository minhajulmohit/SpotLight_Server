import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";
const app = express();

const PORT = process.env.PORT || 8000;

app.use(express.json());
app.use(cors());

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

connectToMongoDB();

// Test API
app.get("/", (req, res) => {
  res.send("Backend Server is Running!");
});

// Studio APIs
app.post("/add-new-studio", async (req, res) => {
  try {
    const data = req.body;
    const result = await studiosCollection.insertOne(data);
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

app.delete("/all-studio/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await studiosCollection.deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    res.status(400).send({ message: "Failed to delete studio." });
  }
});

app.patch("/all-studio/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await studiosCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: req.body },
    );
    res.send(result);
  } catch (error) {
    res.status(400).send({ message: "Studio could not be updated." });
  }
});

app.get("/featured-studio", async (req, res) => {
  try {
    const result = await studiosCollection.find().limit(6).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch featured studios." });
  }
});

// ==========================================
// Booking APIs (with Double-Booking Prevention)
// ==========================================

// Create a new booking
app.post("/bookings", async (req, res) => {
  try {
    const {
      studioId,
      studioTitle,
      hostName,
      hostEmail,
      customerName,
      customerEmail,
      bookingDate,
      startTime,
      endTime,
      totalHours,
      hourlyRate,
      securityDeposit,
      totalPrice,
    } = req.body;

    if (!studioId || !customerEmail || !bookingDate || !startTime || !endTime) {
      return res
        .status(400)
        .json({ message: "Missing required booking details." });
    }

    // Challenge 2: Double-Booking Prevention
    // Verify time overlap against existing "Confirmed" and "Pending" bookings
    const existingBookings = await bookingsCollection
      .find({
        studioId: String(studioId),
        bookingDate: String(bookingDate),
        status: { $in: ["Confirmed", "Pending"] },
      })
      .toArray();

    const isOverlapping = existingBookings.some((b) => {
      // Time overlap rule: startA < endB && endA > startB
      return startTime < b.endTime && endTime > b.startTime;
    });

    if (isOverlapping) {
      return res.status(409).json({
        message:
          "This time slot is already reserved for this studio. Please choose another time or date.",
      });
    }

    const newBooking = {
      studioId: String(studioId),
      studioTitle: studioTitle || "Studio Space",
      hostName: hostName || "Host",
      hostEmail: hostEmail || "",
      customerName: customerName || "Guest Creator",
      customerEmail: customerEmail.trim().toLowerCase(),
      bookingDate: String(bookingDate),
      startTime: String(startTime),
      endTime: String(endTime),
      totalHours: Number(totalHours) || 1,
      hourlyRate: Number(hourlyRate) || 0,
      securityDeposit: Number(securityDeposit) || 0,
      totalPrice: Number(totalPrice) || 0,
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

// Get bookings (filtered by customerEmail or hostEmail)
app.get("/bookings", async (req, res) => {
  try {
    const { email, hostEmail } = req.query;
    const query = {};
    if (email) {
      query.customerEmail = String(email).trim().toLowerCase();
    } else if (hostEmail) {
      query.hostEmail = String(hostEmail).trim().toLowerCase();
    }
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
app.patch("/bookings/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
    if (!booking) {
      return res.status(404).json({ message: "Booking not found." });
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

// Update status (e.g. Confirm or Complete)
app.patch("/bookings/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ["Pending", "Confirmed", "Completed", "Cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value." });
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
