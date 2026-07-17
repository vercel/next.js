"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBox({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const q = query.trim();
        router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
      }}
    >
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search products"
        aria-label="Search products"
        className="w-full rounded-full border border-foreground/20 bg-background px-4 py-2 text-sm"
      />
    </form>
  );
}

export function SearchBoxFallback() {
  return (
    <div
      aria-hidden
      className="h-[38px] w-full rounded-full border border-foreground/20 bg-foreground/5"
    />
  );
}
