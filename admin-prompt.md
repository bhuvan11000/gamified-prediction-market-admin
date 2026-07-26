# Predict Arena — Admin Panel

## Overview

A standalone admin panel for **Predict Arena**, a prediction market game where users bet virtual coins on real-world outcomes. The admin panel connects to the **same Supabase project** as the main game and provides tools to manage markets, players, quests, and system operations that are intentionally excluded from the player-facing app.

This is a **separate repository** from the player-facing app. It talks to the same database but is a completely independent frontend. No API changes are needed in the main app (all admin endpoints are new functions that go alongside the existing ones).

---

## Architecture

```
[Admin Browser]
      │
      ▼
[Netlify Functions] ─── same Supabase project ─── [PostgreSQL Database]
      │                                                 │
      │                                                 ├── public.users
      │                                                 ├── public.markets
      │                                                 ├── public.predictions
      │                                                 ├── public.community_proposals
      │                                                 ├── public.quests
      │                                                 ├── public.user_quests
      │                                                 ├── public.achievements
      │                                                 ├── public.user_achievements
      │                                                 ├── public.market_generation_log
      │                                                 └── ... (14 more tables)
      │
      ▼
[Admin UI] — React + Vite, deployed separately
```

**Key Design Decisions:**

1. **Shared database, separate frontend** — The admin panel is a different repo/deploy that connects to the same Supabase project. It uses its own set of Netlify Functions (prefixed `admin-`) that sit alongside the existing game functions.

2. **Admin auth is email-gated** — No admin roles table. A single admin email is set via `ADMIN_EMAIL` env var on the admin Netlify Functions. Every admin endpoint verifies that the caller's JWT email matches this env var.

3. **All mutations go through Netlify Functions** — The admin UI never calls Supabase directly for writes. It always goes through `.netlify/functions/admin-*` endpoints. Reads can go directly to Supabase (RLS-protected) since admin operations like player search need flexible queries.

4. **No changes to the main app** — The admin panel is a standalone project. The main app has zero knowledge of it.

---

## Database Schema Reference

The admin panel connects to the same database. Key tables:

### `public.users`
```sql
id                  UUID PRIMARY KEY (references auth.users)
username            TEXT UNIQUE NOT NULL
avatar_url          TEXT
level               INTEGER DEFAULT 1
xp                  INTEGER DEFAULT 0
coins               INTEGER DEFAULT 1000
rank                TEXT DEFAULT 'Unranked'
total_predictions   INTEGER DEFAULT 0
correct_predictions INTEGER DEFAULT 0
accuracy            REAL DEFAULT 0.0
net_profit          INTEGER DEFAULT 0
betting_streak      INTEGER DEFAULT 0
longest_streak      INTEGER DEFAULT 0
last_bet_date       DATE
last_login          TIMESTAMPTZ
last_reward_claim   DATE
is_banned           BOOLEAN DEFAULT FALSE  -- ADD THIS COLUMN
created_at          TIMESTAMPTZ DEFAULT NOW()
```

### `public.markets`
```sql
id                  UUID PRIMARY KEY
title               TEXT NOT NULL
description         TEXT NOT NULL
category            TEXT CHECK (IN 'sports','tech','popculture','politics','memes')
resolution_criteria TEXT
source              TEXT CHECK (IN 'ai','community')
status              TEXT CHECK (IN 'open','closed','resolving','resolved','review','cancelled','pending')
creator_id          UUID (nullable, references users — set for community markets)
yes_price           REAL DEFAULT 0.50
no_price            REAL DEFAULT 0.50
q_yes               REAL DEFAULT 0
q_no                REAL DEFAULT 0
b                   REAL DEFAULT 100
volume              INTEGER DEFAULT 0
participant_count   INTEGER DEFAULT 0
opens_at            TIMESTAMPTZ
closes_at           TIMESTAMPTZ
resolved_at         TIMESTAMPTZ
resolution          TEXT
resolution_source   TEXT
dispute_deadline    TIMESTAMPTZ
failed_resolutions  INTEGER DEFAULT 0
approved_by         UUID (nullable)      -- ADD: who approved this market
approved_at         TIMESTAMPTZ (nullable) -- ADD: when approved
created_at          TIMESTAMPTZ DEFAULT NOW()
```

### `public.predictions`
```sql
id                  UUID PRIMARY KEY
user_id             UUID REFERENCES users(id)
market_id           UUID REFERENCES markets(id)
position            TEXT CHECK (IN 'yes','no')
shares              REAL
entry_price         REAL
coins_spent         INTEGER
confidence          INTEGER DEFAULT 1
payout              INTEGER
result              TEXT CHECK (IN 'pending','won','lost','refunded')
resolved_at         TIMESTAMPTZ
created_at          TIMESTAMPTZ DEFAULT NOW()
```

### `public.quests` (templates)
```sql
id                  UUID PRIMARY KEY
title               TEXT NOT NULL
description         TEXT NOT NULL
type                TEXT CHECK (IN 'daily','weekly')
action_type         TEXT NOT NULL
target              INTEGER NOT NULL
xp_reward           INTEGER NOT NULL
coin_reward         INTEGER NOT NULL
criteria            JSONB
```

### `public.user_quests` (assignments)
```sql
id                  UUID PRIMARY KEY
user_id             UUID REFERENCES users(id)
quest_id            UUID REFERENCES quests(id)
progress            INTEGER DEFAULT 0
completed           BOOLEAN DEFAULT FALSE
assigned_at         TIMESTAMPTZ DEFAULT NOW()
reset_at            TIMESTAMPTZ
```

### `public.community_proposals`
```sql
id                  UUID PRIMARY KEY
proposer_id         UUID REFERENCES users(id)
title               TEXT NOT NULL
description         TEXT NOT NULL
category            TEXT
resolution_criteria TEXT
stake_amount        INTEGER
status              TEXT CHECK (IN 'pending','approved','rejected')
upvotes             INTEGER DEFAULT 0
downvotes           INTEGER DEFAULT 0
voting_deadline     TIMESTAMPTZ
closes_at           TIMESTAMPTZ
proposed_at         TIMESTAMPTZ DEFAULT NOW()
```

### `public.market_generation_log`
```sql
id                  UUID PRIMARY KEY
status              TEXT
markets_generated   INTEGER DEFAULT 0
markets_rejected    INTEGER DEFAULT 0
error_details       JSONB
created_at          TIMESTAMPTZ DEFAULT NOW()
```

---

## Feature Specifications

### 1. Dashboard / Overview

A summary page showing:
- **Total players** (count from `users`)
- **Active markets** (count where `status = 'open'`)
- **Markets needing review** (count where `status = 'review'`)
- **Pending AI markets** (count where `status = 'pending'`)
- **Pending proposals** (count from `community_proposals` where `status = 'pending'`)
- **Generation log status** (latest entry from `market_generation_log`)

Each stat card links to the relevant tab.

---

### 2. Markets Tab

Three sub-sections (or a tab with subtabs):

#### 2a. AI Approval Queue

Markets generated by the Gemini cron function are inserted with `status = 'pending'` (requires a one-line change to `generate-markets.js` in the main app: change `status: 'open'` to `status: 'pending'`).

For each pending market, show:
- Title, description, category, resolution criteria, suggested sources (from generation metadata)
- Close date, generation timestamp
- **Approve** button → calls admin function to set `status = 'open'`, `approved_by = admin.id`, `approved_at = NOW()`
- **Reject** button → sets `status = 'rejected'`, `approved_by = admin.id`, `approved_at = NOW()`
- Ability to edit the title/description/category before approving (inline edit)

**Netlify Function:** `admin-approve-market.js`

```
POST /api/admin-approve-market
Headers: Authorization: Bearer <jwt>
Body: {
  market_id: "uuid",
  action: "approve" | "reject",
  edits?: { title?, description?, category?, resolution_criteria?, closes_at? }
}
Response: { success: true, market: { id, status, ... } }
```

#### 2b. Dispute Resolution (existing functionality)

Markets where `status = 'review'` (flagged by the dispute system or auto-resolver). This already exists in the main app and should be replicated here:

- List of markets needing review with disputes listed
- **Resolve YES** / **Resolve NO** buttons → call `admin-resolve-market`
- **Cancel & Refund** button → call `admin-cancel-market`

**Netlify Functions:**

```
POST /api/admin-resolve-market
Headers: Authorization: Bearer <jwt>
Body: { market_id: "uuid", resolution: "yes" | "no" }
Response: result from resolve_market PG function

POST /api/admin-cancel-market
Headers: Authorization: Bearer <jwt>
Body: { market_id: "uuid" }
Response: result from cancel_market PG function
```

#### 2c. Manual Market Creation

A form to create a market directly (no stake, no voting, bypasses Level 3+ gate):
- Title (10–200 chars, must end with `?`)
- Description (20–500 chars)
- Category (dropdown: sports / tech / popculture / politics / memes)
- Resolution Criteria (20–300 chars)
- Close Date (1–90 days from now)
- Source is `'admin'`

Validation mirrors `generate-markets.js` validation rules.

**Netlify Function:** `admin-create-market.js`

```
POST /api/admin-create-market
Headers: Authorization: Bearer <jwt>
Body: { title, description, category, resolution_criteria, closes_at }
Response: { market: { id, title, ... } }
```

---

### 3. Players Tab

#### 3a. Player Search

- Search input with debounced (300ms) query against `users` table by `username` (ILIKE) or `id` (exact match)
- Results show as a paginated table with columns:
  - Username, Level, XP, Coins, Rank, Streak, Total Predictions, Accuracy, Net Profit, Last Login, Banned?
- Click a row to expand into the edit view, or navigate to a player detail route

**Direct Supabase query** (no Netlify Function needed for reads):
```sql
SELECT * FROM users
WHERE username ILIKE '%search%' OR id::text = search
ORDER BY coins DESC
LIMIT 20 OFFSET 0
```

#### 3b. Player Editor

For a selected player, show all editable fields with current values:

| Field | Type | Validation | Notes |
|-------|------|-----------|-------|
| `username` | text | 3–30 chars, unique | |
| `coins` | number | >= 0 | Changing coins auto-recalculates rank via `get_rank_from_coins()` PG function |
| `xp` | number | >= 0 | Changing XP auto-recalculates level |
| `level` | number | >= 1 | Set explicitly (overrides XP-based level) |
| `rank` | text | dropdown: Unranked/Analyst/Strategist/Forecaster/Visionary/Prophet/Omniscient | Set explicitly (overrides coin-based rank) |
| `total_predictions` | number | >= 0 | |
| `correct_predictions` | number | >= 0 | |
| `betting_streak` | number | >= 0 | |
| `longest_streak` | number | >= 0 | |
| `last_bet_date` | date | | |
| `last_reward_claim` | date | | |
| `is_banned` | toggle | | |

Each field saves individually (click Save next to the field, not a full form submit). On save:
- Send only the changed field
- Backend recalculates derived fields (`accuracy = correct / total` if the admin modified predictions, `rank = get_rank_from_coins(coins)` if coins changed and rank wasn't explicitly set)
- Log the change (optional, via a simple `admin_audit_log` table)

**Netlify Function:** `admin-update-player.js`

```
POST /api/admin-update-player
Headers: Authorization: Bearer <jwt>
Body: {
  user_id: "uuid",
  updates: { coins?: number, xp?: number, level?: number, rank?: string, ... }
}
Response: { user: { id, username, ...updated fields } }
```

Backend logic:
```js
// Recalculate accuracy if predictions changed
if (updates.correct_predictions !== undefined || updates.total_predictions !== undefined) {
  const { data: user } = await supabaseAdmin.from('users').select('total_predictions, correct_predictions').eq('id', userId).single();
  const total = updates.total_predictions ?? user.total_predictions;
  const correct = updates.correct_predictions ?? user.correct_predictions;
  if (total > 0) updates.accuracy = correct / total;
}

// Recalculate rank from coins if coins changed and rank wasn't explicitly set
if (updates.coins !== undefined && updates.rank === undefined) {
  const { data: rank } = await supabaseAdmin.rpc('get_rank_from_coins', { p_coins: updates.coins });
  updates.rank = rank;
}
```

#### 3c. Ban / Unban

Toggle `is_banned` on a user. When banned:
- The `login.js` function in the main app should check `is_banned` and return a `banned: true` flag in the response
- The auth store should show a "Your account has been suspended" message

**Netlify Function:** `admin-ban-player.js`

```
POST /api/admin-ban-player
Headers: Authorization: Bearer <jwt>
Body: { user_id: "uuid", ban: true | false, reason?: "string" }
Response: { user_id, is_banned: true, reason: "..." }
```

Optionally add a `ban_reason TEXT` column to `users` if you want to store the reason displayed to the player.

---

### 4. Quests Tab

#### 4a. Player Quest View

- Search/select a player
- Show their active daily and weekly quests (from `user_quests` joined with `quests`)
- For each quest show: title, type, progress/target, completed status, reset_at
- Allow admin to increment progress by 1
- Allow admin to mark quest as completed

**Netlify Functions:**

```
GET /api/admin-player-quests?user_id=uuid
Response: { quests: [{ id, title, type, action_type, progress, target, completed, ... }] }

POST /api/admin-force-quest
Headers: Authorization: Bearer <jwt>
Body: { user_quest_id: "uuid", action: "increment" | "complete" }
Response: { quest: { id, progress, completed, ... } }
```

The `force-quest` function for "complete" should use the existing `complete_quest` PG function. For "increment", use `update_quest_progress` PG function.

---

### 5. System Tab

#### 5a. Generation Log (Read-only)

Display the `market_generation_log` table as a table with columns:
- Created At, Status, Markets Generated, Markets Rejected, Error Details (expandable)

#### 5b. Manual Cron Triggers

Buttons to manually trigger system functions:

| Button | Backend Action | Notes |
|--------|---------------|-------|
| **Generate Markets Now** | Calls existing `generate-markets.js` logic with minor tweak (insert as pending) | Uses admin auth instead of cron secret |
| **Resolve Markets Now** | Calls existing `resolve.js` logic (find expired + resolve via Gemini) | Uses admin auth instead of cron secret |
| **Run Season Transition** | Calls existing `season-transition.js` logic | Uses admin auth instead of cron secret |
| **Reset Expired Quests** | Calls existing `reset-quests.js` logic | Uses admin auth instead of cron secret |

These are thin wrappers that authenticate as admin and call the existing logic directly (or import the shared modules). No cron secret needed.

**Netlify Functions:**

```
POST /api/admin-trigger-generation
Headers: Authorization: Bearer <jwt>
Response: { markets_created, markets_rejected, status }

POST /api/admin-trigger-resolution
Headers: Authorization: Bearer <jwt>
Response: { resolved, reviewed, failed, total }

POST /api/admin-trigger-season
Headers: Authorization: Bearer <jwt>
Response: { season_ended, rewards_awarded, new_season }

POST /api/admin-trigger-reset-quests
Headers: Authorization: Bearer <jwt>
Response: { deleted, type, daily_cleaned, weekly_cleaned }
```

---

## Security Model

- **Admin auth**: Every admin Netlify Function verifies `user.email === process.env.ADMIN_EMAIL` using the existing `verifyAuth()` helper from the main app's `_shared/auth.js`.
- **Frontend guard**: The admin UI checks `import.meta.env.VITE_ADMIN_EMAIL` on the client side before showing any admin UI (fast redirect to home if not admin). The real security is the server-side check.
- **No admin roles table** — Single admin, env var based. If multi-admin is needed later, switch to an `admin_emails` table.
- **All mutations through functions** — The admin UI never writes directly via Supabase JS. Reads can go direct to Supabase for flexibility (search queries).

---

## Data Model Additions (applied to shared DB as migrations)

These changes need to be applied to the shared Supabase project:

```sql
-- Migration: Admin support columns
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Add 'pending' and 'admin' to existing CHECK constraints
ALTER TABLE public.markets DROP CONSTRAINT IF EXISTS markets_status_check;
ALTER TABLE public.markets ADD CONSTRAINT markets_status_check
  CHECK (status IN ('open','closed','resolving','resolved','review','cancelled','pending','rejected'));

-- Optional: audit log for admin actions
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

Also change in the main app's `generate-markets.js`: `status: 'open'` → `status: 'pending'` so new AI markets appear in the approval queue.

---

## UI / UX Guidelines

- **Same dark theme** as the main app (use the same CSS custom properties / design tokens for consistency, since it's the same brand)
- **Tabs layout**: Sticky sidebar with tab navigation (Dashboard, Markets, Players, Quests, System)
- **Tables** should be sortable by clicking column headers
- **Inline editing** for player fields (click to edit, save icon, cancel with Escape)
- **Confirmation modals** for destructive actions (ban, cancel market, reject market)
- **Toast notifications** for success/error feedback
- **Responsive** — admin should work on desktop primarily but be usable on tablet

---

## Tech Stack Suggestions

- **Framework**: React + Vite (matching the main app)
- **Routing**: React Router v7 (already in the main app)
- **Data fetching**: TanStack Query (React Query) for all server state
- **UI primitives**: Same as main app (CSS Modules, custom properties, lucide-react icons)
- **API client**: Reuse the `api.js` pattern from the main app (handles auth header injection)
- **Supabase client**: Direct for reads, Netlify Functions for writes
- **Deploy**: Netlify (same as main app), separate site

---

## Existing Functions You Can Reference

From the main app's `netlify/functions/_shared/` — you can copy these into your admin project:

| File | What it provides |
|------|-----------------|
| `auth.js` | `verifyAuth(req)` — validates JWT, returns user |
| `supabase.js` | `supabaseAdmin` — service role client |
| `cors.js` | `corsHeaders` — CORS headers for responses |
| `amm.js` | LMSR math (not needed for admin) |
| `levels.js` | `calculateLevel(xp)`, `xpForLevel(level)`, `checkLevelUp(...)` |
| `ranks.js` | `getRank(coins)`, `checkRankChange(...)`, `RANK_THRESHOLDS` |
| `rewards.js` | `getDailyReward(rank, isSunday)`, `getProposalCost(rank)` |
| `quests.js` | `updateQuestProgress(...)`, `assignDailyQuests(...)`, `assignWeeklyQuests(...)` |

Your admin Netlify Functions should import `verifyAuth` and `supabaseAdmin` from local copies of these shared modules.

---

## Env Vars Needed

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

# Optional: Gemini key if triggering generation/resolution from admin
GEMINI_API_KEY=...
```

---

## Implementation Order (Recommended)

1. Set up the React + Vite scaffold with routing, auth check, dark theme
2. Copy `auth.js`, `supabase.js`, `cors.js` from the main app's `_shared/` into your project
3. Build the Dashboard tab (stats from Supabase direct reads)
4. Build the Markets tab (approval queue + dispute resolution + create form)
5. Build the Players tab (search + edit + ban)
6. Build the System tab (generation log + manual triggers)
7. Build the Quests tab (player quest view + force progress)
8. Apply the DB migration (add `is_banned`, `approved_by`, `approved_at`, `pending` status)
9. Change `generate-markets.js` in the main app to insert as `status: 'pending'`
10. Deploy both projects
