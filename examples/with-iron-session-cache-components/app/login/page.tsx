"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    null,
  );

  return (
    <main>
      <h1>Log in</h1>
      <form action={action}>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue="ada@example.com"
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            defaultValue="password"
          />
        </div>
        {state?.error && <p>{state.error}</p>}
        <button type="submit" disabled={pending}>
          Log in
        </button>
      </form>
    </main>
  );
}
