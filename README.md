# SpotLight Server

Backend API for the SpotLight studio marketplace.

## Tech Stack

- Node.js and Express.js
- MongoDB
- `jose` for Better Auth JWT verification

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file:

   ```env
   MONGODB_URI=your_mongodb_connection_string
   CLIENT_URL=http://localhost:3000
   PORT=8000
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

The API runs at http://localhost:8000. `CLIENT_URL` must match the client’s `BETTER_AUTH_URL`.
