import { Instant } from 'next'
import { unstable_navigation as navigation } from 'next/cache'

export const instant: Instant = {
  level: 'experimental-error',
}

export default async function Page() {
  return (
    <main>
      <p>
        This page is missing a suspense around navigation(), but that's allowed
        if we're not in partialPrefetching and aren't rendering App Shells.
      </p>
      <NavigationContent />
    </main>
  )
}

async function NavigationContent() {
  await navigation()
  return <div>{`Navigation content`}</div>
}
