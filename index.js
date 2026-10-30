import express from "express";

const app = express();

const PORT = 8000;

app.use(express.json());

// Test API
app.get("/", (req, res) => {
  res.send("Backend Server is Running!");
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
