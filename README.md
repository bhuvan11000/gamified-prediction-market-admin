# Predict Arena — Admin Panel

A standalone admin panel for Predict Arena, a prediction market game where users bet virtual coins on real-world outcomes. This admin panel connects to the same Supabase project as the main game and provides tools to manage markets, players, quests, and system operations.

## Features

- **Dashboard** — Overview with stat cards (total players, active markets, markets needing review, pending AI markets, pending proposals) and latest market generation log.
- **Markets** — Three sub-sections:
  - *AI Approval Queue* — Review and approve/reject pending AI-generated markets with inline editing.
  - *Dispute Resolution* — Resolve flagged markets as YES/NO or cancel and refund.
  - *Manual Creation* — Create markets directly with full validation.
- **Players** — Debounced search by username or ID, paginated table with inline field editing (individual field save), and ban/unban with optional reason.
- **Quests** — Search for a player, view their active daily/weekly quests, increment progress, or force-complete quests.
- **System** — Manual cron triggers (generate markets, resolve markets, season transition, reset quests) with result display and generation log viewer.

## Architecture

```
[Admin Browser]
      |
      v
[Netlify Functions] --- same Supabase project --- [PostgreSQL Database]
      |
      v
[Admin UI] — React + Vite, deployed separately
```

- **Shared database, separate frontend** — The admin panel is a different repo that connects to the same Supabase project with its own set of Netlify Functions (prefixed `admin-`).
- **Admin auth is email-gated** — No admin roles table. A single admin email is set via `ADMIN_EMAIL` env var. Every admin endpoint verifies the caller's JWT email matches this env var.
- **All mutations go through Netlify Functions** — The admin UI never calls Supabase directly for writes. Reads can go direct to Supabase (RLS-protected) for flexible queries.
- **No changes to the main app** — The admin panel is standalone. The main app has zero knowledge of it.

## Tech Stack

- **Framework:** React 19 + Vite 6
- **Routing:** React Router v7
- **Data fetching:** TanStack Query (React Query)
- **State management:** Zustand
- **Icons:** lucide-react
- **Supabase:** @supabase/supabase-js (reads direct, writes through functions)
- **Styling:** CSS Modules with custom properties (same design tokens as main app)
- **Deploy:** Netlify (separate site)

## Environment Variables

```
# Supabase (same as main app)
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# Frontend (safe to expose)
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...

# Admin auth
ADMIN_EMAIL=your-admin-email@gmail.com
VITE_ADMIN_EMAIL=your-admin-email@gmail.com

# Optional: Gemini key for triggering generation/resolution
GEMINI_API_KEY=...
```

## Getting Started

```bash
npm install
cp .env.example .env  # Fill in your values
npm run dev
```

## Netlify Functions

The admin Netlify Functions are in `netlify/functions/`:

| Function | Method | Purpose |
|----------|--------|---------|
| `admin-approve-market` | POST | Approve/reject pending AI markets with optional edits |
| `admin-create-market` | POST | Manual market creation with validation |
| `admin-resolve-market` | POST | Resolve a disputed market as YES or NO |
| `admin-cancel-market` | POST | Cancel a market and refund participants |
| `admin-update-player` | POST | Update individual player fields with auto-calculation |
| `admin-ban-player` | POST | Ban or unban a player with optional reason |
| `admin-player-quests` | GET | Fetch a player's active quests |
| `admin-force-quest` | POST | Increment progress or force-complete a quest |
| `admin-trigger-generation` | POST | Run Gemini market generation (inserts as pending) |
| `admin-trigger-resolution` | POST | Auto-resolve expired markets via Gemini |
| `admin-trigger-season` | POST | End season, award rewards, start new season |
| `admin-trigger-reset-quests` | POST | Clean up expired daily/weekly quests |

All functions verify the caller's JWT email matches `ADMIN_EMAIL` before executing.

## Required DB Migrations

In the shared Supabase project, apply:

```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE public.markets DROP CONSTRAINT IF EXISTS markets_status_check;
ALTER TABLE public.markets ADD CONSTRAINT markets_status_check
  CHECK (status IN ('open','closed','resolving','resolved','review','cancelled','pending','rejected'));

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Also change `status: 'open'` to `status: 'pending'` in the main app's `generate-markets.js` so new AI markets appear in the approval queue.
