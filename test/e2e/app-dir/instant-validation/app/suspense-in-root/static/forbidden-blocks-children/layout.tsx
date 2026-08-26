import { Suspense, type ReactNode } from 'react'
import { connection } from 'next/server'
import { forbidden } from 'next/navigation'

export const instant = false

// See not-found-blocks-children: `forbidden()` throws an HTTP-access-fallback
// signal (403), the same family as notFound(). It must not be reported as an
// instant-validation failure. Requires `experimental.authInterrupts`.
function Bail() {
  forbidden()
}

export default async function Layout({ children }: { children: ReactNode }) {
  await connection()
  return (
    <>
      <p>
        This layout calls forbidden() inside a Suspense boundary that also wraps
        the children slot, preventing the instant page from rendering.
      </p>
      <Suspense>
        <Bail />
        {children}
      </Suspense>
    </>
  )
}
