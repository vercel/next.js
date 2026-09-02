import { unstable_prefetch } from 'next/cache'
import { Suspense } from 'react'

export const instant = { level: 'experimental-error' }

export default async function Page() {
  return (
    <main>
      <p>
        This page uses sync IO after awaiting prefetch():
        {/*
        In partialPrefetching, prefetch() is not allowed in shells,
        so we need a Suspense.
        Before partialPrefetching everything is static, so we could skip it,
        but that's not relevant to this test.
        */}
        <Suspense>
          <SyncIOAfterPrefetch />
        </Suspense>
      </p>
    </main>
  )
}

async function SyncIOAfterPrefetch() {
  await unstable_prefetch()
  return Date.now()
}
