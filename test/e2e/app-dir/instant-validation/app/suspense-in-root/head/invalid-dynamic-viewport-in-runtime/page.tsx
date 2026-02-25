import type { Viewport } from 'next'
import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{}],
}

// Note that we're inside a root layout with suspense, so we skip the static shell
export async function generateViewport(): Promise<Viewport> {
  await connection()
  return {
    themeColor: 'aliceblue',
  }
}

export default async function Page() {
  await cookies()
  return (
    <main>
      <p>This page has a dynamic generateViewport</p>
      <p>
        We also access dynamic data in the page itself, because a static page
        with a dynamic viewport is not allowed.
      </p>
      <Suspense>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  await connection()
  return null
}
