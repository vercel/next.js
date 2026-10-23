"use client";

import { createAuthClient } from "@neondatabase/auth/next";

// Talks to the auth routes in app/api/auth/[...path], which proxy requests to
// Neon Auth and set the session cookies on your own domain.
export const authClient = createAuthClient();
