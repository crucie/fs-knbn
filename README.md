# fs-knbn

Team Kanban board with project-scoped RBAC (ADMIN / MEMBER), JWT auth, and Google Sign-In.

## Stack

- **Frontend:** React + Vite + Tailwind — deploy to Vercel (`https://knbn.kshimate.space`)
- **Backend:** Express + Prisma + PostgreSQL — run locally via Docker
- **Auth:** Username/password JWT + Google Identity Services (ID token)

## Quick start (Docker backend)

```bash
cd backend
# Fill in .env (see .env.example)
docker compose up --build -d
curl http://localhost:5000/api/health
```

```bash
cd frontend
# VITE_API_URL=http://localhost:5000
# VITE_GOOGLE_CLIENT_ID=<same as backend GOOGLE_CLIENT_ID>
npm install
npm run dev
```

Open http://localhost:5173

## Google Sign-In setup

1. [Google Cloud Console](https://console.cloud.google.com/) → OAuth consent screen
2. Credentials → OAuth client ID → **Web application**
3. Authorized JavaScript origins:
   - `http://localhost:5173`
   - `https://knbn.kshimate.space`
4. Copy Client ID into:
   - `backend/.env` → `GOOGLE_CLIENT_ID`
   - `frontend/.env` → `VITE_GOOGLE_CLIENT_ID`

Client Secret is **not** required for this GIS ID-token flow.

## Production env

**Backend (Docker / host)**

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | JWT signing secret |
| `GOOGLE_CLIENT_ID` | Verify Google ID tokens |
| `CORS_ORIGIN` | `https://knbn.kshimate.space` (comma-separated OK) |
| `PORT` | Default `5000` |

**Frontend (Vercel)**

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend origin, e.g. `https://api.example.com` |
| `VITE_GOOGLE_CLIENT_ID` | Same Google Client ID |

## Features

- Signup / login + Continue with Google
- Projects: create, list, delete (admin), leave (member)
- Members: invite by username or email, remove
- Tasks: create, edit, delete, drag status across TODO / IN_PROGRESS / DONE
