"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { deleteTodo } from "@/app/actions";

const initialState = {
  message: "",
};

function DeleteButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" aria-disabled={pending}>
      Delete
    </button>
  );
}

export function DeleteForm({ id, todo }: { id: number; todo: string }) {
  // useActionState is available with React 19 (Next.js App Router)
  const [state, formAction] = useActionState(deleteTodo, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="todo" value={todo} />
      <DeleteButton />
      <p aria-live="polite" className="sr-only" role="status">
        {state?.message}
      </p>
    </form>
  );
}
