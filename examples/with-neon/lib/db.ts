import { neon } from "@neondatabase/serverless";

/**
 * Runs SQL over HTTP with the Neon serverless driver. Each query is a single
 * fetch, which suits Server Components, Server Actions and Route Handlers.
 */
export const sql = neon(process.env.DATABASE_URL!);
