import { cacheLife, cacheTag } from "next/cache";
import { CacheStateWatcher } from "../cache-state-watcher";
import { Suspense } from "react";
import { RevalidateFrom } from "../revalidate-from";
import Link from "next/link";

type TimeData = {
  unixtime: number;
  datetime: string;
  timezone: string;
};

const timeZones = ["cet", "gmt"];

/**
 * `'use cache'` with a short cacheLife so the cache-state watcher can show
 * the fresh → stale transition. Tagged with "time-data" so the server action
 * can invalidate it via `revalidateTag("time-data", "max")`.
 *
 * Falls back to a placeholder when the time API is unreachable (e.g. during
 * `next build` without network access).
 */
async function getTimeData(timezone: string): Promise<TimeData> {
  "use cache";
  cacheLife("minutes");
  cacheTag("time-data");

  try {
    const res = await fetch(
      `https://worldtimeapi.org/api/timezone/${timezone}`,
    );

    if (res.ok) {
      return res.json();
    }
  } catch {
    // Network error — fall through to placeholder.
  }

  return {
    unixtime: Math.floor(Date.now() / 1000),
    datetime: new Date().toISOString(),
    timezone,
  };
}

export default async function Page({ params: { timezone } }) {
  const timeData = await getTimeData(timezone);

  return (
    <>
      <header className="header">
        {timeZones.map((timeZone) => (
          <Link key={timeZone} className="link" href={`/${timeZone}`}>
            {timeZone.toUpperCase()} Time
          </Link>
        ))}
        <Link className="link" href="/use-cache">
          &quot;use cache&quot; demo &rarr;
        </Link>
      </header>
      <main className="widget">
        <div className="pre-rendered-at">
          {timeData.timezone} Time {timeData.datetime}
        </div>
        <Suspense fallback={null}>
          <CacheStateWatcher
            revalidateAfter={60 * 1000}
            time={timeData.unixtime * 1000}
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
