import type { ReactNode } from 'react'

let cacheFillCount = 0

async function CachedShell({
  navigation,
  content,
}: {
  navigation: ReactNode
  content: ReactNode
}) {
  'use cache'

  cacheFillCount++

  return (
    <section id="cached-shell" data-cache-fill-count={cacheFillCount}>
      {navigation}
      {content}
    </section>
  )
}

export default function Page() {
  return (
    <CachedShell
      navigation={<nav>navigation slot</nav>}
      content={<main>content slot</main>}
    />
  )
}
