'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { signIn } from '@/features/user/user-actions';

type State = { error?: string } | null;

async function action(_prev: State, formData: FormData): Promise<State> {
  const result = await signIn(formData);
  if (result && !result.ok) return { error: result.error };
  return null;
}

export function SignInForm() {
  const [state, formAction] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="name" className="text-muted text-sm">
        Sign in with a username
      </label>
      <input
        id="name"
        name="name"
        type="text"
        autoComplete="username"
        required
        autoFocus
        placeholder="Aurora"
        aria-invalid={state?.error ? true : undefined}
        aria-describedby={state?.error ? 'sign-in-error' : undefined}
      />
      {state?.error ? (
        <p id="sign-in-error" role="alert" className="text-sm text-red-500">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full">
        Sign in
      </Button>
    </form>
  );
}
