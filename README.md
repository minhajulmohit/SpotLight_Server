# SpotLight Server — Backend API

Backend REST API for **SpotLight** (Creative Workspace & Production Studio Sharing Platform) built with Express.js, Node.js, and MongoDB.

---

## 🚀 Tech Stack

* **Runtime:** Node.js (ES Modules)
* **Framework:** Express.js 5
* **Database:** MongoDB Atlas (Native MongoDB Node Driver)
* **Security & Tools:** CORS, dotenv, JSON Web Token (JWT), bcryptjs, cookie-parser

---

## 📡 API Endpoints

### 1. Studio Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/all-studio` | Fetch all studio listings |
| `GET` | `/all-studio/:id` | Fetch single studio details by ObjectId |
| `GET` | `/featured-studio` | Fetch top 6 featured studios (`.limit(6)`) |
| `POST` | `/add-new-studio` | Create a new studio listing |
| `PATCH` | `/all-studio/:id` | Update studio details by ObjectId |
| `DELETE` | `/all-studio/:id` | Delete studio listing by ObjectId |

### 2. Booking Endpoints (Challenge 2 Double-Booking Prevention)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/bookings` | Submit new booking with **overlap collision check** (returns 409 on collision) |
| `GET` | `/bookings?email=...` | Retrieve bookings filtered by customer email or host email |
| `PATCH` | `/bookings/:id/cancel` | Cancel a pending booking request |
| `PATCH` | `/bookings/:id/status` | Update booking status (`Pending`, `Confirmed`, `Completed`, `Cancelled`) |

---

## ⚙️ Local Setup Steps

```bash
# 1. Install dependencies
npm install

# 2. Configure .env file
# Create a .env file with the following variables:
PORT=8000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/spotlight?retryWrites=true&w=majority
CLIENT_URL=http://localhost:3000
JWT_SECRET=your_jwt_secret_key

# 3. Start development server
npm run dev
```
Server runs on [http://localhost:8000](http://localhost:8000).
