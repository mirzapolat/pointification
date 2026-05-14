# Pointification

A bright, playful point-tracker for teams. React + Vite + Supabase + Framer Motion.

## Setup

```bash
npm install
cp .env.example .env  # then fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

### Database (Supabase CLI)

```bash
# install once: https://supabase.com/docs/guides/local-development/cli/getting-started
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Or run `supabase/migrations/20260101000000_init.sql` manually in the SQL editor.

### Dev

```bash
npm run dev
```

## What's inside

- **Login** — email + password (Supabase Auth).
- **Game list** — create / edit / delete games. Each game has a name and any number of teams (name + color).
- **Game screen** — full-screen rows, one per team, that together fill the viewport. Tap a row to open the points popup with `+5 / +10 / +15 / -5 / -10 / -15` plus custom amounts. Every change is logged in `point_logs`.
- Atomic scoring via the `apply_point_change(p_team_id, p_delta)` Postgres function — updates the score and writes a log in a single round-trip, guarded by RLS.
- Realtime — score updates propagate to other open tabs via Supabase Realtime.

## Schema

- `games(id, user_id, name, …)`
- `teams(id, game_id, name, color, score, position)`
- `point_logs(id, team_id, game_id, user_id, delta, new_score, created_at)` — ready for a future log/history view.

RLS restricts everything to the owning user.
