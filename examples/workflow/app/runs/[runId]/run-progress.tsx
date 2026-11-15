"use client";

import { useEffect, useState } from "react";
import type { ProgressEvent } from "@/lib/progress";

export function RunProgress({ runId }: { runId: string }) {
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setEvents([]);

    async function read() {
      const response = await fetch(`/api/runs/${runId}/stream`, {
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        setError("Run not found");
        return;
      }

      // The route streams one JSON event per line
      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        const parsed = lines
          .filter(Boolean)
          .map((line) => JSON.parse(line) as ProgressEvent);
        setEvents((previous) => [...previous, ...parsed]);
      }
    }

    read().catch((err: unknown) => {
      if (!controller.signal.aborted) setError(String(err));
    });
    return () => controller.abort();
  }, [runId]);

  const finished = events.some((event) => event.type === "done");

  return (
    <section className="card">
      <p className="status">{error ?? (finished ? "Completed" : "Running…")}</p>
      <ol className="events">
        {events.map((event, index) => (
          <li key={index} data-type={event.type}>
            <span className="time">
              {new Date(event.at).toLocaleTimeString()}
            </span>
            <span>{event.message}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
