import { Instant } from 'next'
import { unstable_navigation as navigation } from 'next/cache'

export const instant: Instant = {
  level: 'experimental-error',
}

export const prefetch = 'partial'

export default async function Page() {
  return (
    <main>
      <p>
        This page is missing a suspense around navigation(), so we can't render
        a shell.
      </p>
      <NavigationContent />
    </main>
  )
}

async function NavigationContent() {
  await navigation()
  return <div>{`Navigation content`}</div>
}
