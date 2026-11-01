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
| `GET` | `/all-studio` | Fetch all studio listings (public) |
| `GET` | `/all-studio/:id` | Fetch single studio details by ObjectId (public) |
| `GET` | `/featured-studio` | Fetch top 6 featured studios (`.limit(6)`) |
| `POST` | `/add-new-studio` | Create a studio listing 🔒 JWT required |
| `PATCH` | `/all-studio/:id` | Update studio details 🔒 JWT + owner only |
| `DELETE` | `/all-studio/:id` | Delete studio listing 🔒 JWT + owner only |

### 2. Authentication (Challenge 1)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/jwt` | Issue a 7-day JWT for the logged-in user and store it in an **HTTPOnly** cookie |
| `POST` | `/jwt/logout` | Clear the JWT cookie |

### 3. Wishlist Endpoints (MongoDB-backed favourites)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/wishlist` | List every studio saved by the signed-in user 🔒 JWT required |
| `POST` | `/wishlist` | Toggle a studio in the signed-in user's wishlist 🔒 JWT required |

> Deleting a studio also removes its wishlist rows, so no orphaned saves remain.

### 4. Booking Endpoints (Challenge 2 Double-Booking Prevention)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/bookings` | Submit a booking with **server-side price calculation** and overlap collision check (409) 🔒 JWT required |
| `GET` | `/bookings?email=...` | Retrieve the signed-in user's bookings (customer or host) 🔒 JWT required |
| `PATCH` | `/bookings/:id/cancel` | Cancel your own pending booking 🔒 JWT required |
| `PATCH` | `/bookings/:id/status` | Host-only status update (`Pending`, `Confirmed`, `Completed`, `Cancelled`) 🔒 JWT required |

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

