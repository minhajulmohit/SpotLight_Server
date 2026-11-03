# SpotLight Server — Backend API

Backend REST API for **SpotLight** (Creative Workspace & Production Studio Sharing Platform) built with Express.js, Node.js, and MongoDB.

---

## 🚀 Tech Stack

* **Runtime:** Node.js (ES Modules)
* **Framework:** Express.js 5
* **Database:** MongoDB Atlas (Native MongoDB Node Driver)
* **Security & Tools:** CORS, dotenv, Better Auth JWKS verification via `jose`

---

## 📡 API Endpoints

### 1. Studio Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/studios` | Fetch all studio listings (public) |
| `GET` | `/api/studios/:id` | Fetch single studio details by ObjectId (public) |
| `GET` | `/api/studios/featured` | Fetch top 6 featured studios (`.limit(6)`) |
| `POST` | `/api/studios` | Create a studio listing 🔒 Bearer JWT required |
| `PATCH` | `/api/studios/:id` | Update studio details 🔒 JWT + owner only |
| `DELETE` | `/api/studios/:id` | Delete studio listing 🔒 JWT + owner only |

### 2. Authentication (Challenge 1)

Browser API requests are forwarded by the existing Next.js `src/proxy.ts`.
For protected requests, it exchanges the Better Auth HTTPOnly session for a
JWT, stores the JWT in an HTTPOnly cookie, and forwards it to Express. Browser
JavaScript never receives or reads the JWT cookie.

```
Authorization: Bearer <jwt>
```

Verification is stateless: `jose` fetches Better Auth's public signing keys
from `${CLIENT_URL}/api/auth/jwks` and checks the token's `iss`/`aud` against
`CLIENT_URL`. No shared `JWT_SECRET` is used by this server.

| Requirement | Value |
|---|---|
| Token source | `src/proxy.ts` reads the Better Auth HTTPOnly session and requests `GET {CLIENT_URL}/api/auth/token`; JWT is stored in an HTTPOnly cookie |
| Signing algorithm | `EdDSA` (`Ed25519`) by default |
| Public keys | `GET {CLIENT_URL}/api/auth/jwks` |
| Protected requests | `401` when the token is missing/invalid, `403` for non-owners |

### 3. Booking Endpoints (Challenge 2 Double-Booking Prevention)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/bookings/availability?studioId=...&bookingDate=...` | Fetch booked times for one studio and date (public) |
| `POST` | `/api/bookings` | Submit a booking with **server-side price calculation** and overlap collision check (409) 🔒 JWT required |
| `GET` | `/api/bookings` | Retrieve the signed-in user's customer bookings 🔒 JWT required |
| `GET` | `/api/bookings?ownerEmail=true` | Retrieve bookings for the signed-in studio owner 🔒 JWT required |
| `PATCH` | `/api/bookings/:id/cancel` | Cancel your own pending booking 🔒 JWT required |
| `PATCH` | `/api/bookings/:id/status` | Owner confirms pending or completes confirmed bookings 🔒 JWT required |

### 4. Newsletter
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/newsletter` | Save a valid email address in the `newsletterSubscriptions` collection; duplicate email returns `409` |

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

# CLIENT_URL must exactly match the client's BETTER_AUTH_URL (scheme + host),
# because it is used both for CORS and as the JWT issuer/audience + JWKS origin.

# 3. Start development server
npm run dev
```
Server runs on [http://localhost:8000](http://localhost:8000).

## Deploy on Vercel

1. Import the repository into Vercel and set **Root Directory** to `spotlight_server`.
2. Add these server environment variables in Vercel's project settings:

   | Variable | Value |
   |---|---|
   | `MONGODB_URI` | Your MongoDB connection string |
   | `CLIENT_URL` | The deployed client origin, for example `https://spotlight-client.vercel.app` |

   `CLIENT_URL` must be the same origin configured as the client's `BETTER_AUTH_URL`; it is used to fetch Better Auth's JWKS and validate JWT issuer/audience.
3. Redeploy after saving the environment variables.
4. Open `https://<your-server-domain>/` to check that the serverless function responds. Check the Vercel function logs if it returns an error. Database routes require the Vercel deployment to be allowed by your MongoDB network access settings.

The Express app is exported for Vercel's Node.js function runtime. Locally, `npm run dev` continues to start the Express listener.
