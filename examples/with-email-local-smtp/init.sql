-- https://authjs.dev/getting-started/adapters/pg
-- Schema for magic-link (email) auth with the Auth.js PostgreSQL adapter.
-- Loaded automatically by the postgres container on first start.
-- The `accounts` table from the full adapter schema is omitted because it is only needed for OAuth providers, not the email flow shown here.


CREATE TABLE verification_token (
  identifier TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE TABLE users (
  id SERIAL,
  name VARCHAR(255),
  email VARCHAR(255),
  "emailVerified" TIMESTAMPTZ,
  image TEXT,
  PRIMARY KEY (id)
);

CREATE TABLE sessions (
  id SERIAL,
  "userId" INTEGER NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL,
  PRIMARY KEY (id)
);
