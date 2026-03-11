import { Instant } from 'next'
import { ThrowsInClient } from './client'

export const unstable_instant: Instant = {
  prefetch: 'static',
  samples: [{ searchParams: {} }],
}

export default function Page() {
  return (
    <main>
      <p>
        This page has an error in a client component with no suspense
        boundaries. It didn't render successfully, so it should be treated as
        blocking validation -- we don't know what content would be rendered if
        the error didn't occur.
      </p>
      <ThrowsInClient />
    </main>
  )
}
