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
    console.err("MongoDB connection failed:", err);
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

app.post("/add-new-studio", async (req, res) => {
  const data = req.body;
  const result = await studiosCollection.insertOne(data);
  console.log(result);
  res.send(result);
});
app.get("/all-studio", async (req, res) => {
  const result = await studiosCollection.find().toArray();
  console.log(result);
  res.send(result);
});

app.get("/all-studio/:id", async (req, res) => {
  const { id } = req.params;
  const result = await studiosCollection.findOne({ _id: new ObjectId(id) });
  res.send(result);
});

app.delete("/all-studio/:id", async (req, res) => {
  const { id } = req.params;

  const result = await studiosCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
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
  const result = await studiosCollection.find().limit(6).toArray();

  res.send(result);
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
