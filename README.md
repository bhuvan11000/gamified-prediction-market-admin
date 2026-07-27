# Predict Arena — Admin Panel

A standalone admin panel for Predict Arena. Connects to the same Supabase project as the main game.

## Features

- **Dashboard** — Stats (Total Players, Live Markets, Needs Review, Drafts for Today, Pending Proposals) and generation log.
- **Markets** — Draft Queue (delete drafts with countdown), Dispute Resolution (resolve YES/NO, cancel & refund), Manual Creation.
- **Players** — Search, inline editing, ban/unban.
- **Quests** — View player quests, force-progress/complete.
- **System** — Manual cron triggers that proxy to main app via CRON_SECRET.

## Architecture

```
[Admin Browser] ──> [Vite Dev Server (5174)] ──proxy──> [Express API (3001)]
                                                           │
                                                           v
                                              [Supabase Admin Client] ──> [PostgreSQL]
                                                           │
                                              [Main App Proxy] ──> [Main App /api/*]
```

- **Shared database, separate frontend** — same Supabase project, different repo.
- **Admin auth is email-gated** — JWT email must match `ADMIN_EMAIL`.
- **Expres API** replaces Netlify Functions for local development.
- **Trigger functions** proxy to the main app endpoints with `x-cron-secret`.

## Tech Stack

React 19, Vite 6, React Router 7, TanStack Query, Zustand, lucide-react, Express, Supabase JS, CSS Modules.

## Environment Variables

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
ADMIN_EMAIL=your-admin-email@gmail.com
VITE_ADMIN_EMAIL=your-admin-email@gmail.com
MAIN_APP_URL=http://localhost:8888
CRON_SECRET=secret123
```

## Getting Started

```bash
npm install
cp .env.example .env  # Fill in your values
npm run dev:all        # Starts Vite (port 5174) + Express API (port 3001)
```

Open `http://localhost:5174` and sign in with Google.
