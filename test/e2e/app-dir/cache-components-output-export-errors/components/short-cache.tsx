import { cacheLife } from 'next/cache'
import { setTimeout } from 'node:timers/promises'
import { Suspense } from 'react'

type Profile = { stale: number; revalidate: number; expire: number }

async function cachedData(profile: Profile) {
  'use cache'
  cacheLife(profile)
  await setTimeout(0)
  return 'Short-lived cached data'
}

async function Content({ profile }: { profile: Profile }) {
  return <p>{await cachedData(profile)}</p>
}

export default function Page({ profile }: { profile: Profile }) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Content profile={profile} />
    </Suspense>
  )
}
