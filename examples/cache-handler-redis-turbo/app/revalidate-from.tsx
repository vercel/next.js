"use client";

import { useFormStatus } from "react-dom";
import revalidate from "./server-actions";

function RevalidateButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="revalidate-from-button"
      type="submit"
      disabled={pending}
      aria-disabled={pending}
    >
      Revalidate
    </button>
  );
}

export function RevalidateFrom() {
  return (
    <form className="revalidate-from" action={revalidate}>
      <RevalidateButton />
    </form>
  );
}
