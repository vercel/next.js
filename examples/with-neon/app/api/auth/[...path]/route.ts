import { auth } from "@/lib/auth/server";

// Proxies every Neon Auth request (sign in, sign up, sign out, password reset,
// session refresh) through your app so cookies are set on your domain.
export const { GET, POST } = auth.handler();
