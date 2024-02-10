import { createClient } from "@libsql/client";

export const db = createClient({
  url: process.env.TURSO_DB_URL ? process.env.TURSO_DB_URL : "file:./dev.db",
  authToken: process.env.TURSO_DB_TOKEN,
});
