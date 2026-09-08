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

Pointification is fully self-contained: one Node process serves the SPA, runs
the API, and owns a SQLite database file. No external database, auth provider,
or object store to sign up for.

### Run it locally (dev)

```bash
git clone <your fork>
cd pointification
npm install
cp .env.example .env   # optional: donate link, SMTP

npm run dev:server     # API + SQLite on http://localhost:3000
npm run dev            # Vite dev server on http://localhost:5173
```

Run both. Vite proxies `/api` and `/logos` to the API server, so the browser
sees a single origin and the session cookie works exactly as in production.
The database is created on first boot at `data/pointification.db`; uploaded
logos land in `data/logos/`. Requires Node 24+ (for the built-in `node:sqlite`).

### Email (optional)

Signup normally emails a 6-digit verification code. If `SMTP_HOST` is unset the
app skips that step entirely and confirms new accounts immediately — which is
usually what you want on a private instance.

# Self-hosting with Docker

Pointification ships as a single container. Everything that needs to persist —
the SQLite database and uploaded logos — lives under `/data`, which compose
bind-mounts to `./data`. Back up that directory and you have backed up the app.

```bash
cp .env.example .env   # optional: donate link, SMTP
docker compose up --build -d
# → http://localhost:3000
```

> `VITE_*` values are inlined into the SPA at build time, so rebuild the image
> (`docker compose up --build`) whenever they change.

To run the production server without Docker:

```bash
npm run build
npm start              # serves dist/ + API on http://localhost:3000
```

### Search and AI discovery

`npm run build` pre-renders the homepage, imprint and privacy policy from the
same React components used by the browser. The Node server serves these pages
as complete HTML; JavaScript hydrates them and loads the signed-in experience.
Use `npm start` to preview this production behavior (`vite preview` only serves
the app shell and assets).

`server/seo.js` defines public page metadata and homepage structured data. The
build generates the sitemap from that public-page list. Keep the product copy,
FAQ and structured data consistent when changing features or pricing.

Search and AI crawlers can read public pages under the wildcard robots rule.
Login, account, game and token-based share pages send `noindex` in both HTML
and HTTP headers; their URLs are omitted from the sitemap. Share links retain
game-specific social previews. Crawling app pages is allowed so crawlers can
read `noindex`; authentication still controls access to private data.

After deployment, submit `https://pointification.de/sitemap.xml` in Google
Search Console and Bing Webmaster Tools, and inspect the homepage's rendered
HTML. Hosting or firewall rules must also allow search crawlers. Indexing and
AI citations depend on the search provider and are not guaranteed by these
changes. See [Google's AI search guidance](https://developers.google.com/search/docs/appearance/ai-features)
and [OpenAI's crawler documentation](https://developers.openai.com/api/docs/bots).

### How it fits together

| Piece | Where it lives |
| --- | --- |
| Schema | `server/schema.sql` — applied on boot, idempotent |
| API routes | `server/routes/` — auth, account, games, teams, rounds, public, realtime |
| Live updates | Server-Sent Events (`server/lib/events.js` → `src/lib/realtime.js`) |
| Sessions | httpOnly cookie, opaque token hashed at rest |
| Passwords / 2FA | scrypt (`server/lib/auth.js`) and RFC 6238 TOTP (`server/lib/totp.js`) |
| Logos | files under `LOGO_DIR`, served read-only from `/logos` |
| Client API | `src/lib/api.js` — every call resolves to `{ data, error }` |

Because live updates are an in-process pub/sub, the app is meant to run as a
single instance. That is the one thing to revisit before scaling horizontally.

# License

**Pointification is proprietary software.** All rights reserved by the author.

This repository is public for viewing only. You **may not** copy, fork, run, deploy, modify, redistribute, or build derivative works from this code — in whole or in part, commercial or non-commercial — without prior written permission from the author. See [LICENSE](LICENSE) for the full terms.

If you'd like to use, license, or collaborate on Pointification, please get in touch first.
