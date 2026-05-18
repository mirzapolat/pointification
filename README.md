<img width="852" height="330" alt="Screenshot 2026-05-18 at 15 35 01" src="https://github.com/user-attachments/assets/9ec9bde3-08b4-4ab5-adf3-d4508a3f2a06" />

# Pointification

**Pointification** is a delightfully chunky, candy-colored point tracker that turns "wait, what's the score?" into the most satisfying tap of your evening. Built for trivia nights, classroom quizzes, sports practice, family game wars, and any moment that needs a number to go up (or down, if you've allowed that sort of thing).

No spreadsheets. No napkins. No arguments. Just points, popping into existence.

# Why you'll love it

🎲 **Tap to score** — full-screen team rows, one tap opens a popup with `+5 / +10 / +15 / -5 / -10 / -15` and custom amounts. Each tap flashes. Yes, it feels good.

🌈 **Bring your own colors** — pick from a curated palette or punch in any hex you want. Make Team Pink Pandas actually pink.

🖼️ **Slap a logo on it** — upload a logo and choose how it lives: a chunky badge in the middle of the screen, a wide top row banner, or just decoratively on the game card. Round or rounded-square. Scale it up to crop out whitespace, scale it down for a roomier bubble.

🤝 **Play together, live** — invite collaborators by email. Anyone at the table can keep score. Realtime updates everywhere — every device sees the same number at the same time.

🔗 **Share a public link** — generate a read-only scoreboard URL. Friends, parents, that one cousin watching from the couch — they all see the live score, no account needed.

📜 **Every point is logged** — full history with delta and timestamp. Settle every debate.

# Getting Started

### Run it locally

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
