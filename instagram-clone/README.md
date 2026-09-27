# VELOVE — Instagram Clone (single main project)

One project, two applications:

```
instagram-clone/
├── backend/     Express + MongoDB API (port 5000)
├── frontend/    Vite + vanilla JS UI (port 5173, proxies /api → :5000)
└── package.json Project scripts
```

## Quick start

```bash
# 1. Install dependencies (first time only)
npm run install:all

# 2. Start the backend (connects to MongoDB, database: vlove)
npm run dev:backend

# 3. In a second terminal, start the frontend
npm run dev:frontend
```

Open http://localhost:5173 — signup/login talk to the API through the Vite proxy.

## Environment configuration

- `backend/.env` — port, `MONGO_URI` (default `mongodb://localhost:27017/vlove`),
  JWT secret, Cloudinary keys (optional — falls back to local `backend/uploads/`),
  SMTP credentials (optional — registration works without it), `CLIENT_URL`.
- `frontend/.env` — `VITE_API_URL=/api` (uses the Vite proxy; no CORS issues).

## What's implemented

- Auth: register, login (JWT cookie), logout, me, email verification, password reset
- Users: profile, follow/unfollow, search, suggested
- Posts: create (image/video upload), feed, like, save/bookmark, delete
- Comments: add, list, like, delete (threaded replies)
- Stories: create, active stories, view tracking (24h TTL)
- Messages: conversations, send text/media, read receipts
- Notifications: list, mark read, delete
