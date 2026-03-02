import type { Viewport } from 'next'
import { Suspense } from 'react'
import { cookies } from 'next/headers'

// This would be valid if it used a runtime prefetch (because then it wouldn't block navigation),
// but it's static, so it's invalid. As an extra sanity check, we put a runtime prefetch on the
// layout above, and that should not make this error go away.
export const unstable_instant = { prefetch: 'static' }

export async function generateViewport(): Promise<Viewport> {
  await cookies()
  return {
    themeColor: 'aliceblue',
  }
}

export default function Page() {
  return (
    <main>
      <p>This page has a runtime generateViewport</p>
      <p>
        We also access runtime data in the page itself, because a fully static
        page with a runtime vieport is not allowed.
      </p>
      <Suspense>
        <Runtime />
      </Suspense>
    </main>
  )
}

async function Runtime() {
  await cookies()
  return null
}
