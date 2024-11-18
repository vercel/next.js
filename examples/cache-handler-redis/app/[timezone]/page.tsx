import { notFound } from "next/navigation";
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

export const revalidate = 500;

export async function generateStaticParams() {
  return timeZones.map((timezone) => ({ timezone }));
}

export default async function Page({ params: { timezone } }) {
  const data = await fetch(
    `https://worldtimeapi.org/api/timezone/${timezone}`,
    {
      next: { tags: ["time-data"] },
    },
  );

  if (!data.ok) {
    notFound();
  }

  const timeData: TimeData = await data.json();

  return (
    <>
      <header className="header">
        {timeZones.map((timeZone) => (
          <Link key={timeZone} className="link" href={`/${timeZone}`}>
            {timeZone.toUpperCase()} Time
          </Link>
        ))}
      </header>
      <main className="widget">
        <div className="pre-rendered-at">
          {timeData.timezone} Time {timeData.datetime}
        </div>
        <Suspense fallback={null}>
          <CacheStateWatcher
            revalidateAfter={revalidate * 1000}
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
