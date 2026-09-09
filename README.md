# Pointification

Pointification is a score tracker for quiz nights, games, classrooms, or anything
else where you're keeping points. Create a game, add your teams, and update the
scores as you go. You can invite other people to help keep score or share a
read-only link for everyone watching.

<img width="852" height="330" alt="Pointification scoreboard" src="https://github.com/user-attachments/assets/9ec9bde3-08b4-4ab5-adf3-d4508a3f2a06" />

Teams have their own colors, games can have a custom logo, and every score change
is recorded in the history. Scores update live across connected devices. People
viewing a shared scoreboard don't need an account.

## How it runs

The app uses React and Vite on the frontend, with an Express server and SQLite
behind it. One Node process serves the site, handles accounts, stores data, and
sends live updates over Server-Sent Events. Uploaded logos are saved on disk.

There is no Supabase dependency or external database to set up. Email is optional.
The app is designed to run as a single server instance; live updates are shared
within that process.

## Local development

You'll need **Node.js 24 or newer**. From the project directory, install the
dependencies and build the initial pages:

```bash
npm ci
npm run build
```

Start the API server:

```bash
npm run dev:server
```

Then, in another terminal, start Vite:

```bash
npm run dev
```

Open **http://localhost:5173**. Vite forwards API requests and logo uploads to the
Node server on port 3000. The database is created automatically on first startup
at `data/pointification.db`, and uploaded logos go into `data/logos/`.

To view the production build locally, stop the development API server and run:

```bash
npm run build
npm start
```

Open **http://localhost:3000**. Use this to check the rendered public pages and
share previews; `npm run preview` only serves the frontend build.

## Deployment

The Docker image includes the frontend, API, and database runtime. The included
Compose file is configured for this project's hosting setup: an existing Traefik
proxy on the external `home` network, serving `pointification.de` over HTTPS. It
also references the `secure-headers` and `compress` Traefik middlewares and the
`letsencrypt` certificate resolver.

If you're using that setup, start it with:

```bash
cp .env.example .env
# Edit .env if you want to configure email or the donate link.
docker compose up --build -d
```

For a different host, adjust the domain, proxy labels, and network in
`docker-compose.yml` first. Compose exposes port 3000 to the proxy; it does not
publish a port on localhost. Production sessions use secure cookies, so serve
the app over HTTPS.

The container stores its database and logos under `/data`, mounted from `./data`
on the host. Keep that directory when replacing or rebuilding the container.
To make a simple backup, stop the app briefly and copy the whole directory.

## Configuration

The defaults are enough to run locally. The optional settings are listed in
[.env.example](.env.example).

| Setting | Purpose |
| --- | --- |
| `VITE_DONATE_URL` | URL for the support button. Leave it empty to hide the button. |
| `SMTP_HOST` | Mail server for signup verification codes. Without it, new accounts are verified immediately. |
| `SMTP_PORT` | Mail server port; defaults to `587`. Port `465` uses TLS from the start. |
| `SMTP_USER`, `SMTP_PASS` | Mail server credentials, if required. |
| `SMTP_FROM` | Sender address for verification emails. |
| `DATABASE_PATH` | SQLite file location. Defaults to `data/pointification.db` when running directly. |
| `LOGO_DIR` | Upload directory. Defaults to `data/logos/` when running directly. |
| `PORT` | Node server port; defaults to `3000`. Compose sets this to `3000` inside the container. |

Compose reads `.env` and passes the relevant settings to the container. When
running Node directly, export server settings in your shell; the npm server
commands don't load `.env` automatically. The `/data` paths in `.env.example`
are intended for Docker.

Vite reads `VITE_DONATE_URL` at build time, so rebuild after changing it. If you
change the API port during development, set `VITE_API_TARGET` for Vite to the
matching address.

## Finding your way around

- `src/` contains the React pages and components.
- `src/lib/api.js` is the frontend API client; `src/lib/realtime.js` handles live updates.
- `server/routes/` handles accounts, games, teams, rounds, and public scoreboards.
- `server/schema.sql` defines the database tables and is applied on startup.
- `server/lib/` contains authentication, two-factor authentication, email, uploads, and live events.
- `server/seo.js` defines public page metadata and structured data.
- `scripts/prerender.mjs` generates the public HTML pages and sitemap during the build.

The homepage, imprint, and privacy policy are rendered at build time. Account,
game, and share pages are marked `noindex` and left out of the sitemap. Public
share links still get game-specific previews when posted elsewhere.

## License

Pointification is proprietary software by Mirza Polat. The repository is public
for viewing, but running, copying, modifying, deploying, or redistributing it
requires prior written permission. The setup notes above are for authorized use.
See [LICENSE](LICENSE) for the full terms.
