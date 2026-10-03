import type { ReactNode } from 'react'

function SlotContainer({
  navigation,
  content,
}: {
  navigation: ReactNode
  content: ReactNode
}) {
  return (
    <section id="nested-cached-shell">
      {navigation}
      {content}
    </section>
  )
}

async function CachedShell({
  navigation,
  content,
}: {
  navigation: ReactNode
  content: ReactNode
}) {
  'use cache'

  return <SlotContainer navigation={navigation} content={content} />
}

export default function Page() {
  return (
    <CachedShell
      navigation={<nav>nested navigation slot</nav>}
      content={<main>nested content slot</main>}
    />
  )
}
