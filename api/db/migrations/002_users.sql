-- Accounts and refresh tokens for JWT sign-in.

CREATE TABLE users (
  id             text PRIMARY KEY,
  email          text NOT NULL,
  name           text NOT NULL,
  role           text NOT NULL CHECK (role IN ('admin', 'production', 'viewer')),
  password_hash  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- Only a SHA-256 of each refresh token is stored. Tokens rotate on every use;
-- all tokens from one sign-in share a family_id so a reused token can revoke them all.
CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  family_id   uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);
