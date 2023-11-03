'use server'

import { notFound } from 'next/navigation'
import { CacheStateWatcher } from './cache-state-watcher'
import { formatTime } from '../utils/format-time'
import { Suspense } from 'react'
import { RevalidateFrom } from './revalidate-from'
import Link from 'next/link'

type TimeData = {
  unixtime: number
}

const revalidate = 10

export default async function Page() {
  const data = await fetch('https://worldtimeapi.org/api/timezone/UTC', {
    next: { revalidate, tags: ['time-data'] },
  })

  if (!data.ok) {
    notFound()
  }

  const timeData: TimeData = await data.json()

  const unixTimeMs = timeData.unixtime * 1000

  return (
    <>
      <main className="widget">
        <div className="pre-rendered-at">
          Pre-rendered at {formatTime(unixTimeMs)}
        </div>
        <Suspense fallback={null}>
          <CacheStateWatcher
            revalidateAfter={revalidate * 1000}
            time={unixTimeMs}
          />
        </Suspense>
        <RevalidateFrom />
      </main>
      <footer className="footer">
        <Link
          href={process.env.NEXT_PUBLIC_REDIS_INSIGHT_URL}
          className="external-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          View RedisInsight &#x21AA;
        </Link>
      </footer>
    </>
  )
}
