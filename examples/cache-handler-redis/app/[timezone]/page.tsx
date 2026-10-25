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

// How long the cached time stays fresh (seconds). Shared with the countdown UI.
const REVALIDATE_SECONDS = 500;

// Cache the upstream time in the `remote` cache handler (Redis) rather than the
// default in-memory cache, so it's shared across instances and survives
// restarts. `updateTag("time-data")` invalidates it on demand.
async function getCurrentTime(
  ianaTimeZone: string,
): Promise<CachedTime | null> {
  "use cache: remote";
  cacheTag("time-data");
  cacheLife({ stale: 60, revalidate: REVALIDATE_SECONDS, expire: 3600 });

  const response = await fetch(
    `https://timeapi.io/api/time/current/zone?timeZone=${ianaTimeZone}`,
  );

  if (!response.ok) {
    return null;
  }

  // `Date.now()` is allowed here because this is a cached function: the value
  // is baked into the remote cache entry and refreshes when it revalidates.
  return { time: await response.json(), generatedAt: Date.now() };
}

export function generateStaticParams() {
  return Object.keys(timeZones).map((timezone) => ({ timezone }));
}

export default async function Page({ params }: PageProps<"/[timezone]">) {
  const { timezone } = await params;
  const ianaTimeZone = timeZones[timezone as keyof typeof timeZones];

  if (!ianaTimeZone) {
    notFound();
  }

  const cached = await getCurrentTime(ianaTimeZone);

  if (!cached) {
    notFound();
  }

  const { time: timeData, generatedAt } = cached;

  return (
    <>
      <header className="header">
        {Object.keys(timeZones).map((timeZone) => (
          <Link key={timeZone} className="link" href={`/${timeZone}`}>
            {timeZone.toUpperCase()} Time
          </Link>
        ))}
      </header>
      <main className="widget">
        <div className="pre-rendered-at">
          {timezone.toUpperCase()} Time {timeData.dateTime}
        </div>
        <Suspense fallback={null}>
          <CacheStateWatcher
            revalidateAfter={REVALIDATE_SECONDS * 1000}
            time={generatedAt}
          />
        </Suspense>
        <RevalidateFrom />
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
