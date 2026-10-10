import { io } from 'next/cache'
import { Suspense } from 'react'

export const instant = { level: 'experimental-error' }

export default async function Page() {
  return (
    <main>
      <p>
        This page uses sync IO after awaiting io():
        <Suspense>
          <SyncIOAfterIO />
        </Suspense>
      </p>
    </main>
  )
}

async function SyncIOAfterIO() {
  await io()
  return Date.now()
}
