import type { Viewport } from 'next'
import { cookies } from 'next/headers'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{}],
}

export async function generateViewport(): Promise<Viewport> {
  await cookies()
  return {
    themeColor: 'aliceblue',
  }
}

export default async function Page() {
  await cookies()
  return (
    <main>
      <p>This page has a runtime generateViewport</p>
      <p>
        We also access runtime data in the page itself, because a static page
        with a runtime vieport is not allowed.
      </p>
    </main>
  )
}
