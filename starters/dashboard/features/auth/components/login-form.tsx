"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/features/auth/auth-actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    null,
  );

  return (
    <div className="mx-auto mt-16 max-w-xs">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <form action={action} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Username
          <input
            name="username"
            required
            autoComplete="username"
            className="rounded-lg border border-foreground/20 bg-background px-3 py-2"
          />
        </label>
        {state?.error ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-70"
        >
          {pending ? "Signing in…" : "Continue"}
        </button>
      </form>
      <p className="mt-4 text-xs text-foreground/50">
        Any username works. Replace features/auth with real authentication.
      </p>
    </div>
  );
}
