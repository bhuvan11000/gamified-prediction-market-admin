# Predict Arena — Admin Panel

A standalone admin panel for Predict Arena. Connects to the same Supabase project as the main game.

## Features

- **Dashboard** — Stats (Total Players, Live Markets, Needs Review, Drafts for Today, Pending Proposals) and generation log.
- **Markets** — Draft Queue (delete drafts with countdown), Dispute Resolution (resolve YES/NO, cancel & refund), Manual Creation.
- **Players** — Search, inline editing (coins, xp, level, rank, streaks, etc.), ban/unban with reason.
- **Quests** — View player quests, increment progress, force-complete with reward distribution.
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
- **Admin auth is email/password** — JWT email must match `ADMIN_EMAIL`. Uses Supabase Auth's built-in email/password sign-in.
- **Express API** — replaces Netlify Functions. Runs on port 3001.
- **Trigger functions** proxy to the main app endpoints with `x-cron-secret` header.
- **Player updates** use the service role key directly (bypasses RLS). Derived fields (rank from coins, accuracy from predictions) are recalculated server-side.

## Tech Stack

React 19, Vite 6, React Router 7, TanStack Query, Zustand, lucide-react, Express, Supabase JS, CSS Modules.

## API Endpoints (Express server, port 3001)

All endpoints require `Authorization: Bearer <JWT>` header and verify the caller's email matches `ADMIN_EMAIL`.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin-create-market` | Create a market manually with validation |
| POST | `/api/admin-delete-market` | Proxy to main app to delete a draft market |
| POST | `/api/admin-resolve-market` | Resolve a disputed market as YES/NO via `resolve_market` RPC |
| POST | `/api/admin-cancel-market` | Cancel a market and refund participants via `cancel_market` RPC |
| POST | `/api/admin-update-player` | Update player fields (coins auto-recalculates rank, preds auto-recalculate accuracy) |
| POST | `/api/admin-ban-player` | Ban/unban a player with optional reason |
| GET | `/api/admin-player-quests` | Fetch a player's active quests (ordered by `assigned_at`) |
| POST | `/api/admin-force-quest` | Increment progress or force-complete a quest (distributes rewards) |
| POST | `/api/admin-trigger-generation` | Proxy to main app `/api/generate-markets` |
| POST | `/api/admin-trigger-resolution` | Proxy to main app `/api/resolve-expired-markets` |
| POST | `/api/admin-trigger-season` | Proxy to main app `/api/season-transition` |
| POST | `/api/admin-trigger-reset-quests` | Proxy to main app `/api/reset-quests` |

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

`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are used by the Express server for admin writes. `VITE_*` vars are used by the frontend for reads and auth.

## Getting Started

```bash
npm install
cp .env.example .env  # Fill in your values
npm run dev:all        # Starts Vite (port 5174) + Express API (port 3001)
```

Open `http://localhost:5174` and sign in with your admin email and password.

## Database Notes

- The `users` table has no INSERT/UPDATE/DELETE RLS policies — all writes go through the Express server with the service role key.
- Updating `coins` auto-recalculates `rank` via `get_rank_from_coins(coins)` RPC.
- Updating `correct_predictions` or `total_predictions` auto-recalculates `accuracy`.
- The `user_quests` table uses `assigned_at` (not `created_at`) as the creation timestamp.
- The `is_banned` and `ban_reason` columns on `users` are not in the base schema — run `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE; ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;` if needed.
