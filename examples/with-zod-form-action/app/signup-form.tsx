"use client";

import { useActionState } from "react";
import { fieldError, formError, initialActionState } from "zod-form-action";
import { signup } from "./actions";

export default function SignupForm() {
  const [state, action, pending] = useActionState(signup, initialActionState);

  return (
    <form action={action} className="space-y-6">
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-medium">
          Email
        </label>

        <input
          id="email"
          name="email"
          type="email"
          className="w-full rounded-md border px-3 py-2"
          placeholder="you@example.com"
        />

        {fieldError(state, "email") && (
          <p className="mt-1 text-sm text-red-600">
            {fieldError(state, "email")}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium">
          Password
        </label>

        <input
          id="password"
          name="password"
          type="password"
          className="w-full rounded-md border px-3 py-2"
        />

        {fieldError(state, "password") && (
          <p className="mt-1 text-sm text-red-600">
            {fieldError(state, "password")}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="mb-2 block text-sm font-medium"
        >
          Confirm password
        </label>

        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          className="w-full rounded-md border px-3 py-2"
        />

        {fieldError(state, "confirmPassword") && (
          <p className="mt-1 text-sm text-red-600">
            {fieldError(state, "confirmPassword")}
          </p>
        )}
      </div>

      {formError(state) && (
        <p className="text-sm text-red-600">{formError(state)}</p>
      )}

      {state.status === "error" && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
