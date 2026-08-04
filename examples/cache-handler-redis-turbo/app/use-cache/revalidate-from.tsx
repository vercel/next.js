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
      Revalidate &quot;use cache&quot;
    </button>
  );
}

export function RevalidateUseCacheFrom() {
  return (
    <form className="revalidate-from" action={revalidate}>
      <RevalidateButton />
    </form>
  );
}
