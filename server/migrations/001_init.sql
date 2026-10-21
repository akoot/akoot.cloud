-- Up Migration
-- Cloud storage service: initial schema (PostgreSQL 13+)
-- gen_random_uuid() is built in from PG13, no extension needed.


-- Shared trigger to keep updated_at current
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------
-- users
-- ---------------------------------------------------------------
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text        NOT NULL,
  username       text        NOT NULL,
  password_hash  text        NOT NULL,                  -- argon2id string
  role           text        NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
  quota_bytes    bigint      NOT NULL DEFAULT 5368709120,  -- 5 GiB; set to 10 GiB for paid
  used_bytes     bigint      NOT NULL DEFAULT 0,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_role_check     CHECK (role IN ('user', 'admin')),
  CONSTRAINT users_quota_check    CHECK (quota_bytes >= 0),
  CONSTRAINT users_used_check     CHECK (used_bytes >= 0),
  CONSTRAINT users_username_check CHECK (username ~ '^[A-Za-z0-9_-]{3,32}$')
);

-- Case-insensitive uniqueness
CREATE UNIQUE INDEX users_email_unique    ON users (lower(email));
CREATE UNIQUE INDEX users_username_unique ON users (lower(username));

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------
-- files
-- ---------------------------------------------------------------
-- A row is inserted only after the upload is complete, verified,
-- and renamed into its final location on disk.
CREATE TABLE files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name         text        NOT NULL,                    -- original filename, display only
  mime_type    text        NOT NULL DEFAULT 'application/octet-stream',
  size_bytes   bigint      NOT NULL,
  sha256       bytea       NOT NULL,                    -- 32 bytes
  storage_key  text        NOT NULL,                    -- e.g. 'ab/cd/<uuid>', never user-controlled
  deleted_at   timestamptz,                             -- soft delete (trash)
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT files_size_check   CHECK (size_bytes >= 0),
  CONSTRAINT files_sha256_check CHECK (octet_length(sha256) = 32),
  CONSTRAINT files_name_check   CHECK (length(name) BETWEEN 1 AND 255),
  CONSTRAINT files_storage_key_unique UNIQUE (storage_key)
);

-- "List my files" (active)
CREATE INDEX files_owner_active_idx ON files (owner_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Trash view and the purge job
CREATE INDEX files_deleted_idx ON files (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE TRIGGER files_set_updated_at
  BEFORE UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------
-- share_links
-- ---------------------------------------------------------------
-- The slug is the short URL, e.g. https://example.com/my-cool-file
--
-- Slug rules enforced by the database:
--   * stored lowercase only, so 'MyFile' and 'myfile' can never coexist
--   * 3-32 chars: a-z, 0-9, '_' and '-', starting with a letter or digit
--   * globally unique across ALL rows, including revoked ones
--
-- TODO: Reserved words ('api', 'login', ...) are checked in the app, in one place.
--
-- Cooldown: revoked links stay in the table as tombstones, which keeps
-- their slug taken. A cleanup job hard-deletes rows where
-- revoked_at < now() - interval '30 days' to release the slug.
-- If the underlying file is purged, file_id becomes NULL (the tombstone
-- survives). A link is live only if file_id IS NOT NULL AND revoked_at IS NULL.
CREATE TABLE share_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id         uuid        REFERENCES files (id) ON DELETE SET NULL,
  created_by      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  slug            text        NOT NULL,
  password_hash   text,                                  -- optional, argon2id
  expires_at      timestamptz,                           -- optional
  max_downloads   integer,                               -- optional
  download_count  integer     NOT NULL DEFAULT 0,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT share_links_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  CONSTRAINT share_links_max_downloads_check CHECK (max_downloads IS NULL OR max_downloads > 0),
  CONSTRAINT share_links_download_count_check CHECK (download_count >= 0)
);

-- The race-free uniqueness guarantee. Catch SQLSTATE 23505 and return 409.
CREATE UNIQUE INDEX share_links_slug_unique ON share_links (slug);

CREATE INDEX share_links_file_idx    ON share_links (file_id);
CREATE INDEX share_links_creator_idx ON share_links (created_by, created_at DESC);

-- Cleanup job: find tombstones whose cooldown has passed
CREATE INDEX share_links_revoked_idx ON share_links (revoked_at)
  WHERE revoked_at IS NOT NULL;

CREATE TRIGGER share_links_set_updated_at
  BEFORE UPDATE ON share_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- Down Migration
DROP TABLE share_links;
DROP TABLE files;
DROP TABLE users;
DROP FUNCTION set_updated_at();
