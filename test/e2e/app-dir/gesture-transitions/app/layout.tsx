'use client'

import { ReactNode, startTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const pendingResolvers = new Set<() => void>()

export default function Root({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const isOnHomePage = pathname === '/'

  const startGesture = (href: string) => {
    // NOTE: In a real scenario, this would be startGestureTransition,
    // not startTransition.
    startTransition(async () => {
      // Call gesture push to show prefetched content immediately
      ;(router as any).experimental_gesturePush(href)

      // Create a promise that won't resolve until the "end gesture" button
      // is clicked. This simulates a gesture that takes time to complete.
      await new Promise<void>((resolve) => {
        pendingResolvers.add(resolve)
      })

      // After the gesture ends, perform the canonical navigation
      router.push(href)
    })
  }

  const endGesture = () => {
    // Resolve all pending gestures
    for (const resolve of pendingResolvers) {
      resolve()
    }
    pendingResolvers.clear()
  }

  return (
    <html>
      <body>
        <header>
          <h1>Gesture Transitions Test</h1>
          <p>
            This test simulates a gesture transition using two buttons. "Start
            Gesture" calls <code>experimental_gesturePush</code> and begins an
            async transition that doesn't complete until "End Gesture" is
            clicked. This allows observing the intermediate gesture state before
            the canonical navigation completes.
          </p>
        </header>
        <nav>
          <Link href="/target-page">Link to target</Link>
          <button
            data-testid="start-gesture"
            onClick={() => startGesture('/target-page')}
            disabled={!isOnHomePage}
          >
            Start Gesture
          </button>
          <button data-testid="end-gesture" onClick={endGesture}>
            End Gesture
          </button>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
