import express from "express";
import { MongoClient } from "mongodb";
import "dotenv/config";

const app = express();

const PORT = process.env.PORT || 8000;

app.use(express.json());

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

connectToMongoDB();

// Test API
app.get("/", (req, res) => {
  res.send("Backend Server is Running!");
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
