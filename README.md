# 🎯 Pointification

> The scoreboard for game night, classroom, and chaos.

**Pointification** is a delightfully chunky, candy-colored point tracker that turns "wait, what's the score?" into the most satisfying tap of your evening. Built for trivia nights, classroom quizzes, sports practice, family game wars, and any moment that needs a number to go up (or down, if you've allowed that sort of thing).

No spreadsheets. No napkins. No arguments. Just points, popping into existence.

---

## ✨ Why you'll love it

🎲 **Tap to score** — full-screen team rows, one tap opens a popup with `+5 / +10 / +15 / -5 / -10 / -15` and custom amounts. Each tap flashes. Yes, it feels good.

🌈 **Bring your own colors** — pick from a curated palette or punch in any hex you want. Make Team Pink Pandas actually pink.

🖼️ **Slap a logo on it** — upload a logo and choose how it lives: a chunky badge in the middle of the screen, a wide top row banner, or just decoratively on the game card. Round or rounded-square. Scale it up to crop out whitespace, scale it down for a roomier bubble.

🤝 **Play together, live** — invite collaborators by email. Anyone at the table can keep score. Realtime updates everywhere — every device sees the same number at the same time.

🔗 **Share a public link** — generate a read-only scoreboard URL. Friends, parents, that one cousin watching from the couch — they all see the live score, no account needed.

📜 **Every point is logged** — full history with delta and timestamp. Settle every debate.

📦 **Archive instead of delete** — past tournaments stay around but out of the way.

🎉 **A signup that doesn't feel like signup** — name → email code → optional "tell us about you" → guided first game in 60 seconds. Then you're scoring.

---

## 🛠️ Built with

| Layer | Tech |
|------|------|
| Frontend | **React 18** + **Vite** + **Tailwind** + **Framer Motion** |
| Backend  | **Supabase** (Postgres, Auth, Storage, Realtime) |
| Vibes    | Hand-tuned chunky borders, candy gradients, springy animations |

The whole thing is open and ready to self-host — clone it, point it at your own Supabase project, and run.

---

## 🚀 Run it locally

```bash
git clone <your fork>
cd pointification
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev
```

### Wire up the database

```bash
# install the Supabase CLI: https://supabase.com/docs/guides/local-development/cli/getting-started
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

…or paste the migrations under `supabase/migrations/` into the SQL editor by hand.

That's it. `npm run dev` and you're scoring.

---

## 🧠 What's under the hood

### Schema highlights
- `games` — the room. Has a name, an owner, optional logo (`logo_path`, `logo_placement`, `logo_shape`, `logo_scale`), public-share token, archive flag.
- `teams` — competitors. Name, color, score, position.
- `point_logs` — every delta ever applied, with timestamp + author.
- `game_members` — collaborators added by the owner.
- `profiles` — display name + email mirror of `auth.users` for friendly UI lookups.
- `user_details` — optional onboarding info (org, role, intended use) + onboarding-complete flag.
- `game-logos` (Storage) — public-read bucket, paths scoped to `{user_id}/{game_id}/`.

### One-trip scoring
The `apply_point_change(p_team_id, p_delta)` Postgres function updates the team's score **and** writes the log row in a single transaction — guarded by RLS so only owners and members of the game can score.

### Realtime everywhere
Supabase Realtime fans out every team/game/member change. Open the same game on your phone and your laptop and watch them stay in sync.

### Public links
Owner toggles sharing → a one-way `public_token` UUID is generated → anon viewers can read (but never write) the game and its teams. Rotate the token to instantly revoke an old link.

### Instant-apply settings
Every knob in the game editor — name, teams, colors, logo, allow-negative — writes through to Supabase the moment you tab away or click. No "Save changes" button. No lost work.

---

## 🎨 Design

The look is a deliberate love letter to chunky, hand-drawn neobrutalism:
- 2px ink-black borders everywhere
- Chunky drop shadows (`shadow-chunk`)
- A candy palette: hot pink, mint, yellow, blue, purple, coral
- Bold display type, springy entrance animations, generous whitespace

Built to feel friendly, not corporate. A party tool, not enterprise software.

---

## 📂 Project layout

```
src/
  pages/        Landing · Login · Verify · Welcome · Onboarding
                GameList · GameScreen · GameLog · PublicGame · Account
  components/   GameEditor (the big one) · Dialogs · AnimatedNumber · PointPopup
  lib/          supabase client · auth context · color palette
supabase/
  migrations/   All schema + storage policies, ordered by date
```

---

## 🙌 Contributing / tinkering

Pointification is intentionally simple and hackable. Fork it, theme it, add your own scoring rules, wire it to a different backend — make it yours.

Bug? Feature idea? Wild redesign? PRs welcome.

---

**Now go score some points.** 🎉
