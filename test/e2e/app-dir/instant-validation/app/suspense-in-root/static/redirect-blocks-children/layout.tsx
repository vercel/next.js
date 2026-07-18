import { Suspense, type ReactNode } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'

export const instant = false

// See not-found-blocks-children: `redirect()` is a navigation signal, not a
// validation failure. It goes through `isRedirectError`, the other branch of
// the skip in the validation onError handler.
function Bail() {
  redirect('/suspense-in-root')
}

export default async function Layout({ children }: { children: ReactNode }) {
  await connection()
  return (
    <>
      <p>
        This layout calls redirect() inside a Suspense boundary that also wraps
        the children slot, preventing the instant page from rendering.
      </p>
      <Suspense>
        <Bail />
        {children}
      </Suspense>
    </>
  )
}
