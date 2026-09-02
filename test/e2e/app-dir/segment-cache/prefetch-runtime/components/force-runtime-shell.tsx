import { cookies } from 'next/headers'
import { Suspense } from 'react'

/** Forces the page to use a runtime shell by using cookies. */
export function ForceRuntimeShell() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  )
}

async function Inner() {
  await cookies()
  return null
}
