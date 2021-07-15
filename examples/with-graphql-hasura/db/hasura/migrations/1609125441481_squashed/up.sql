
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE "public"."todos"(
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "value" TEXT,
    PRIMARY KEY ("id") );
