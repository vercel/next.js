import { createClient } from '@libsql/client/http';

export const tursoClient = createClient({
  url: process.env.NEXT_TURSO_DB_URL as string,
  authToken: process.env.NEXT_TURSO_DB_AUTH_TOKEN as string,
});
