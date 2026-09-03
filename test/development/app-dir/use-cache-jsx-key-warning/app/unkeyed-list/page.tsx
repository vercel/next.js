import type { ReactNode } from 'react'

let cacheFillCount = 0

async function CachedList({
  first,
  second,
}: {
  first: ReactNode
  second: ReactNode
}) {
  'use cache'

  cacheFillCount++

  const items = Object.freeze([first, second])

  return (
    <section id="unkeyed-list" data-cache-fill-count={cacheFillCount}>
      {items}
    </section>
  )
}

export default function Page() {
  return (
    <CachedList
      first={<article>first item</article>}
      second={<article>second item</article>}
    />
  )
}
