import type { ReactNode } from 'react'

let cacheFillCount = 0

function RuntimeList({
  first,
  second,
  fillCount,
}: {
  first: ReactNode
  second: ReactNode
  fillCount: number
}) {
  const items = Object.freeze([first, second])

  return (
    <section id="nested-unkeyed-list" data-cache-fill-count={fillCount}>
      {items}
    </section>
  )
}

async function CachedList({
  first,
  second,
}: {
  first: ReactNode
  second: ReactNode
}) {
  'use cache'

  cacheFillCount++

  return (
    <RuntimeList first={first} second={second} fillCount={cacheFillCount} />
  )
}

export default function Page() {
  return (
    <CachedList
      first={<article>nested first item</article>}
      second={<article>nested second item</article>}
    />
  )
}
