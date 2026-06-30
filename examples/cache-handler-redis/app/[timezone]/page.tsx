import { notFound } from "next/navigation";
import { CacheStateWatcher } from "../cache-state-watcher";
import { Suspense } from "react";
import { RevalidateFrom } from "../revalidate-from";
import Link from "next/link";

type TimeData = {
  dateTime: string;
  timeZone: string;
};

// Map the friendly route segment to an IANA timezone for the time API.
const timeZones = {
  cet: "Europe/Amsterdam",
  gmt: "Etc/UTC",
} as const;

export const revalidate = 500;

export function generateStaticParams() {
  return Object.keys(timeZones).map((timezone) => ({ timezone }));
}

export default async function Page({ params }: PageProps<"/[timezone]">) {
  const { timezone } = await params;
  const ianaTimeZone = timeZones[timezone as keyof typeof timeZones];

  if (!ianaTimeZone) {
    notFound();
  }

  const data = await fetch(
    `https://timeapi.io/api/time/current/zone?timeZone=${ianaTimeZone}`,
    {
      next: { tags: ["time-data"] },
    },
  );

  if (!data.ok) {
    notFound();
  }

  const timeData: TimeData = await data.json();
  // Captured when this cache entry is (re)generated, so the freshness
  // countdown reflects the age of the cached entry.
  const generatedAt = Date.now();

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
            revalidateAfter={revalidate * 1000}
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
