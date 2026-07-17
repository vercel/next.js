"use client";

import { useState } from "react";

export function Composer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || disabled) {
      return;
    }
    setInput("");
    onSend(text);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex gap-2">
      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Say something"
        className="flex-1 rounded-full border border-foreground/20 bg-background px-4 py-2 text-sm"
      />
      <button
        disabled={disabled}
        className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-70"
      >
        Send
      </button>
    </form>
  );
}
