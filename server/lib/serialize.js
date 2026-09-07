// SQLite stores booleans as 0/1 and point_presets as JSON text. The client was
// written against Postgres types, so normalise on the way out.

const bool = (v) => v === 1 || v === true

export function serializeGame(row) {
  if (!row) return null
  let presets
  try { presets = JSON.parse(row.point_presets ?? '[]') } catch { presets = [] }
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    is_public: bool(row.is_public),
    public_token: row.public_token ?? null,
    allow_negative: bool(row.allow_negative),
    archived_at: row.archived_at ?? null,
    logo_path: row.logo_path ?? null,
    logo_placement: row.logo_placement ?? null,
    logo_shape: row.logo_shape,
    logo_scale: row.logo_scale,
    point_presets: presets,
    team_sort: row.team_sort,
    rounds_enabled: bool(row.rounds_enabled),
    current_round_id: row.current_round_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function serializeTeam(row) {
  if (!row) return null
  return {
    id: row.id,
    game_id: row.game_id,
    name: row.name,
    color: row.color,
    score: row.score,
    position: row.position,
    created_at: row.created_at,
  }
}

export function serializeRound(row) {
  if (!row) return null
  return {
    id: row.id,
    game_id: row.game_id,
    name: row.name,
    position: row.position,
    created_at: row.created_at,
  }
}

export function serializeLog(row) {
  if (!row) return null
  return {
    id: row.id,
    team_id: row.team_id,
    game_id: row.game_id,
    user_id: row.user_id ?? null,
    // Joined in so the activity log can name who scored without a second query.
    user_email: row.user_email ?? null,
    round_id: row.round_id ?? null,
    delta: row.delta,
    new_score: row.new_score,
    created_at: row.created_at,
  }
}

export function serializeUser(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name ?? null,
    allow_invites: bool(row.allow_invites),
    email_confirmed_at: row.email_confirmed_at ?? null,
    two_factor_enabled: !!row.totp_confirmed_at,
    created_at: row.created_at,
  }
}

export function serializeDetails(row) {
  if (!row) return null
  return {
    organization: row.organization ?? null,
    role: row.role ?? null,
    intended_use: row.intended_use ?? null,
    details_completed_at: row.details_completed_at ?? null,
    onboarding_completed_at: row.onboarding_completed_at ?? null,
  }
}
