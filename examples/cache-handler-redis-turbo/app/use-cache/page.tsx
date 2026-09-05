import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { RevalidateUseCacheFrom } from "./revalidate-from";

type UselessFact = {
  id: string;
  text: string;
};

/**
 * `'use cache'` directive (Next.js 16+ Cache Components).
 *
 * This function's return value is cached via the plural `cacheHandlers`
 * API — pointed at `cache-components-handler.js` in next.config.js.
 * The cached entry is shared across all server instances through Redis,
 * and `revalidateTag("use-cache-fact", "max")` invalidates it on every
 * instance.
 *
 * Falls back to a placeholder when the API is unreachable (e.g. during
 * `next build` without network access).
 */
async function getUselessFact(): Promise<UselessFact> {
  "use cache";
  cacheLife("minutes");
  cacheTag("use-cache-fact");

  try {
    const res = await fetch("https://uselessfacts.jsph.pl/api/v2/facts/random");

    if (res.ok) {
      return res.json();
    }
  } catch {
    // Network error — fall through to placeholder.
  }

  return {
    id: "placeholder",
    text: "Cache is king — this placeholder shows when the API is unreachable during build.",
  };
}

export default async function UseCachePage() {
  const fact = await getUselessFact();

  return (
    <>
      <header className="header">
        <Link className="link" href="/cet">
          &larr; Time demo
        </Link>
      </header>
      <main className="widget">
        <div className="card">
          <h2>&quot;use cache&quot; — shared via Redis</h2>
          <div className="value">{fact.text}</div>
          <span className="badge">cacheLife: minutes</span>
        </div>
        <RevalidateUseCacheFrom />
      </main>
      <footer className="footer">
        <Link
          href={process.env.NEXT_PUBLIC_REDIS_INSIGHT_URL}
          className="link"
          target="_blank"
          rel="noopener noreferrer"
        >
          View RedisInsight &#x21AA;
        </Link>
      </footer>
    </>
  );
}
