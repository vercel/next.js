import { cacheLife, io } from "next/cache";

export async function RuntimeEnvironment() {
  // Without this call, the value would be read during `next build` and
  // stored in the static shell, ignoring `docker run -e APP_ENV=...`.
  await io();
  return (
    <code className="bg-zinc-100 px-2 py-1 rounded text-zinc-800">
      {process.env.APP_ENV ?? "not set"}
    </code>
  );
}

export async function CachedTimestamp() {
  "use cache";
  cacheLife("minutes");
  return (
    <code className="bg-zinc-100 px-2 py-1 rounded text-zinc-800">
      {new Date().toISOString()}
    </code>
  );
}
