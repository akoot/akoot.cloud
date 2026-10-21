-- Up Migration

-- ---------------------------------------------------------------
-- invites: registration is invite-only.
-- Store only a hash of the code; show the plaintext once at creation.
-- The very first admin is created by a CLI script, not by an invite.
-- ---------------------------------------------------------------
CREATE TABLE invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash   text        NOT NULL,                       -- sha256 hex of the code
  created_by  uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  used_by     uuid        REFERENCES users (id) ON DELETE SET NULL,
  used_at     timestamptz,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT invites_code_hash_unique UNIQUE (code_hash)
);

CREATE INDEX invites_created_by_idx ON invites (created_by, created_at DESC);

-- ---------------------------------------------------------------
-- sessions: server-side sessions referenced by an httpOnly cookie.
-- The cookie holds a random token; only its sha256 hash is stored,
-- so a leaked database cannot be used to hijack sessions.
-- ---------------------------------------------------------------
CREATE TABLE sessions (
  token_hash   text        PRIMARY KEY,                   -- sha256 hex of the cookie token
  user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);

CREATE INDEX sessions_user_idx    ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- Down Migration
DROP TABLE sessions;
DROP TABLE invites;
