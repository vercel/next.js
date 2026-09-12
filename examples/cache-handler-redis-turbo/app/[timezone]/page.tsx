import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { CacheStateWatcher } from "../cache-state-watcher";
import { Suspense } from "react";
import { RevalidateFrom } from "../revalidate-from";
import Link from "next/link";

type TimeData = {
  dateTime: string;
  timeZone: string;
};

type CachedTime = {
  time: TimeData;
  generatedAt: number;
};

// Map the friendly route segment to an IANA timezone for the time API.
const timeZones = {
  cet: "Europe/Amsterdam",
  gmt: "Etc/UTC",
} as const;

/**
 * `'use cache'` with a short cacheLife so the cache-state watcher can show
 * the fresh → stale transition. Tagged with "time-data" so the server action
 * can invalidate it via `updateTag("time-data")`.
 *
 * Falls back to a placeholder when the time API is unreachable (e.g. during
 * `next build` without network access).
 */
async function getTimeData(ianaTimeZone: string): Promise<CachedTime> {
  "use cache";
  cacheLife("minutes");
  cacheTag("time-data");

  try {
    const res = await fetch(
      `https://timeapi.io/api/time/current/zone?timeZone=${ianaTimeZone}`,
    );

    if (res.ok) {
      const time: TimeData = await res.json();
      return { time, generatedAt: Date.now() };
    }
  } catch {
    // Network error — fall through to placeholder.
  }

  return {
    time: {
      dateTime: new Date().toISOString(),
      timeZone: ianaTimeZone,
    },
    generatedAt: Date.now(),
  };
}

/**
 * Async content component rendered inside <Suspense> so that uncached data
 * access (the `await params` + `'use cache'` fetch) doesn't block the
 * entire route from prerendering.
 */
async function TimeContent({
  params,
}: {
  params: Promise<{ timezone: string }>;
}) {
  const { timezone } = await params;
  const ianaTimeZone = timeZones[timezone as keyof typeof timeZones];

  if (!ianaTimeZone) {
    notFound();
  }

  const { time: timeData, generatedAt } = await getTimeData(ianaTimeZone);

  return (
    <>
      <div className="pre-rendered-at">
        {timeData.timeZone} Time {timeData.dateTime}
      </div>
      <Suspense fallback={null}>
        <CacheStateWatcher
          revalidateAfter={60 * 1000}
          time={generatedAt}
        />
      </Suspense>
      <RevalidateFrom />
    </>
  );
}

export function generateStaticParams() {
  return Object.keys(timeZones).map((timezone) => ({ timezone }));
}

export default async function Page({ params }: PageProps<"/[timezone]">) {
  return (
    <>
      <header className="header">
        {Object.keys(timeZones).map((timeZone) => (
          <Link key={timeZone} className="link" href={`/${timeZone}`}>
            {timeZone.toUpperCase()} Time
          </Link>
        ))}
        <Link className="link" href="/use-cache">
          &quot;use cache&quot; demo &rarr;
        </Link>
      </header>
      <main className="widget">
        <Suspense fallback={<div className="pre-rendered-at">Loading…</div>}>
          <TimeContent params={params} />
        </Suspense>
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
