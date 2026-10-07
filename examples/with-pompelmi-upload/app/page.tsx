"use client";

import { FormEvent, useState } from "react";

type ApiResult = unknown;

export default function Page() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);

    const form = event.currentTarget;
    const input = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = input?.files?.[0];

    if (!file) {
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      const json = await response.json();
      setResult(json);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during upload.";
      setResult({ error: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "40px auto",
        padding: "0 16px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>Next.js + Pompelmi</h1>
      <p>Upload a file and inspect it before storage.</p>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <input name="file" type="file" />
        <button type="submit" disabled={loading}>
          {loading ? "Scanning..." : "Upload"}
        </button>
      </form>

      {result && (
        <pre
          style={{
            marginTop: 24,
            padding: 16,
            background: "#f5f5f5",
            borderRadius: 8,
            overflowX: "auto",
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}