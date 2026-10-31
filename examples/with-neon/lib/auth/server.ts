import { createNeonAuth } from "@neondatabase/auth/next/server";

/**
 * Server-side Neon Auth instance. Use it in Server Components, Server Actions,
 * Route Handlers and the proxy. Session data is cached in a signed, HTTP-only
 * cookie, so most `getSession()` calls don't need a round trip to Neon Auth.
 */
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});
