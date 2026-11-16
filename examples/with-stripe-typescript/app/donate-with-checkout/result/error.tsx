"use client";

export default function ErrorPage({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);

  return <h2>{message}</h2>;
}
