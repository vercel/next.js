import { unstable_navigation as navigation } from 'next/cache'
import { Suspense } from 'react'

export const instant = { level: 'experimental-error' }

export default async function Page() {
  return (
    <main>
      <p>
        This page uses sync IO after awaiting navigation():
        {/*
        In partialPrefetching, navigation() is not allowed in shells,
        so we need a Suspense.
        Before partialPrefetching everything is static, so we could skip it,
        but that's not relevant to this test. 
        */}
        <Suspense>
          <SyncIOAfterNavigation />
        </Suspense>
      </p>
    </main>
  )
}

async function SyncIOAfterNavigation() {
  await navigation()
  return Date.now()
}
