import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { MockGitHub } from "@mockatoo/connect-authjs";

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  // In development and tests, sign in with Mockatoo's mock of GitHub, so no
  // GitHub OAuth app is needed. Production uses GitHub.
  providers: [process.env.NODE_ENV === "production" ? GitHub : MockGitHub()],
});
