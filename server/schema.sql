-- Pointification — SQLite schema.
-- Mirrors the shapes the old Postgres/Supabase schema exposed to the client:
-- text UUIDs, ISO-8601 timestamps, 0/1 booleans (serialised back to real
-- booleans by server/lib/serialize.js), and point_presets as a JSON array.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL,
  email_lower        TEXT NOT NULL UNIQUE,
  password_hash      TEXT NOT NULL,
  display_name       TEXT,
  email_confirmed_at TEXT,
  allow_invites      INTEGER NOT NULL DEFAULT 1,
  totp_secret        TEXT,
  totp_confirmed_at  TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- Signup email codes. One pending code per user; re-sending replaces it.
CREATE TABLE IF NOT EXISTS email_codes (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Opaque session tokens (hashed at rest); the raw token lives in an httpOnly cookie.
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  -- 'aal1' = password only, 'aal2' = password + TOTP for this session.
  aal         TEXT NOT NULL DEFAULT 'aal1',
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS user_details (
  user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  organization            TEXT,
  role                    TEXT,
  intended_use            TEXT,
  details_completed_at    TEXT,
  onboarding_completed_at TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  is_public        INTEGER NOT NULL DEFAULT 0,
  public_token     TEXT UNIQUE,
  allow_negative   INTEGER NOT NULL DEFAULT 0,
  archived_at      TEXT,
  logo_path        TEXT,
  logo_placement   TEXT CHECK (logo_placement IN ('center', 'top', 'menu')),
  logo_shape       TEXT NOT NULL DEFAULT 'circle' CHECK (logo_shape IN ('circle', 'square')),
  logo_scale       REAL NOT NULL DEFAULT 0.8 CHECK (logo_scale >= 0.4 AND logo_scale <= 1.6),
  point_presets    TEXT NOT NULL DEFAULT '[5,10,15,-5,-10,-15]',
  team_sort        TEXT NOT NULL DEFAULT 'manual' CHECK (team_sort IN ('manual', 'asc', 'desc')),
  rounds_enabled   INTEGER NOT NULL DEFAULT 0,
  current_round_id TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS games_user_id_idx ON games(user_id);
CREATE INDEX IF NOT EXISTS games_archived_at_idx ON games(archived_at);

CREATE TABLE IF NOT EXISTS teams (
  id         TEXT PRIMARY KEY,
  game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#FFD93D',
  score      INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS teams_game_id_idx ON teams(game_id);

CREATE TABLE IF NOT EXISTS rounds (
  id         TEXT PRIMARY KEY,
  game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  name       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rounds_game_id_idx ON rounds(game_id);

CREATE TABLE IF NOT EXISTS point_logs (
  id         TEXT PRIMARY KEY,
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  round_id   TEXT REFERENCES rounds(id) ON DELETE SET NULL,
  delta      INTEGER NOT NULL,
  new_score  INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS point_logs_team_id_idx  ON point_logs(team_id);
CREATE INDEX IF NOT EXISTS point_logs_game_id_idx  ON point_logs(game_id);
CREATE INDEX IF NOT EXISTS point_logs_round_id_idx ON point_logs(round_id);

CREATE TABLE IF NOT EXISTS game_members (
  game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, user_id)
);
CREATE INDEX IF NOT EXISTS game_members_user_idx ON game_members(user_id);
