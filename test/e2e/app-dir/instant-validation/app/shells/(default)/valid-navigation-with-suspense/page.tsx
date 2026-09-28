import { Instant } from 'next'
import { unstable_navigation as navigation } from 'next/cache'
import { Suspense } from 'react'

export const instant: Instant = {
  level: 'experimental-error',
}

export const prefetch = 'partial'

export default async function Page() {
  return (
    <main>
      <p>
        This page has a suspense around navigation(), so we can render a shell
        and should have no validation errors.
      </p>
      <Suspense>
        <NavigationContent />
      </Suspense>
    </main>
  )
}

async function NavigationContent() {
  await navigation()
  return <div>{`Navigation content`}</div>
}
