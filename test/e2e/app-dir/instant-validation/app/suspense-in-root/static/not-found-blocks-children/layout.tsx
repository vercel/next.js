import { Suspense, type ReactNode } from 'react'
import { connection } from 'next/server'
import { notFound } from 'next/navigation'

export const instant = false

// A parent layout that bails with a framework navigation signal (here
// `notFound()`) must NOT be reported as an instant-validation failure. The
// signal is an intentional bail, not "an error prevented the target segment
// from rendering", so no "Could not validate `instant`" wrapper should appear.
function Bail() {
  notFound()
}

export default async function Layout({ children }: { children: ReactNode }) {
  await connection()
  return (
    <>
      <p>
        This layout calls notFound() inside a Suspense boundary that also wraps
        the children slot, preventing the instant page from rendering.
      </p>
      <Suspense>
        <Bail />
        {children}
      </Suspense>
    </>
  )
}
