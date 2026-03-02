import type { Viewport } from 'next'
import { connection } from 'next/server'

export const unstable_instant = false

export async function generateViewport(): Promise<Viewport> {
  await connection()
  return {
    themeColor: 'aliceblue',
  }
}

export default async function Page() {
  await connection()
  return (
    <main>
      <p>
        This page has a dynamic generateViewport. That's not prefetchable, but
        it has <code>instant = false</code>, so blocking is valid. However, this
        violates a static assertion in a parent layout, so ultimately it still
        fails validation.
      </p>
      <p>
        We also access runtime data in the page itself, because a static page
        with a dynamic vieport is not allowed.
      </p>
    </main>
  )
}
