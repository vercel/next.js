"use client";

import { signIn } from "@/lib/auth-client";

export function SignInButton() {
  return (
    <div>
      <p>You are not logged in</p>
      <button onClick={() => signIn.social({ provider: "github" })}>
        Sign in with GitHub
      </button>
    </div>
  );
}
