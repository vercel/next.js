import { Suspense } from 'react'
import { cookies } from 'next/headers'

// With cacheComponents (PPR) the response is:
//   [static shell] [prerender-deferred segments] [resume stream]
// React's getPostponedState snapshots `nextSegmentId` BEFORE the prelude flush.
// The flush then OUTLINES the large completed boundaries into the shell — each
// emits `<template id="B:n">` + `<div hidden id="S:n">` and consumes ids
// allocated AFTER that snapshot. The resume render is seeded from the stale
// snapshot and re-allocates the very same ids for its own outlined boundaries,
// so the served document carries duplicate B:/S: pairs.
export default function Page() {
  return (
    <main>
      {[0, 1, 2, 3].map((n) => (
        <Suspense key={n} fallback={<p>loading static {n}…</p>}>
          <BigStatic n={n} />
        </Suspense>
      ))}
      {[0, 1, 2, 3].map((n) => (
        <Suspense key={n} fallback={<p>loading dynamic {n}…</p>}>
          <DynamicUser n={n} />
        </Suspense>
      ))}
    </main>
  )
}

// Large + fully static, so Fizz outlines this completed boundary into the shell.
function BigStatic({ n }: { n: number }) {
  return (
    <section>
      <h2>static {n}</h2>
      {Array.from({ length: 80 }, (_, i) => (
        <p key={i}>
          static {n} row {i} — abcdefghijklmnopqrstuvwxyz0123456789
        </p>
      ))}
    </section>
  )
}

// cookies() postpones during the prerender; on resume the nested large static
// Suspense is outlined by the resume's own Fizz instance, reusing shell ids.
async function DynamicUser({ n }: { n: number }) {
  const user = (await cookies()).get('user')?.value ?? 'anonymous'
  return (
    <div>
      user {n}: {user}
      <Suspense fallback={<p>nested {n}…</p>}>
        <NestedBulk n={n} />
      </Suspense>
    </div>
  )
}

function NestedBulk({ n }: { n: number }) {
  return (
    <section>
      <h3>nested {n}</h3>
      {Array.from({ length: 150 }, (_, i) => (
        <p key={i}>
          nested {n} row {i} — abcdefghijklmnopqrstuvwxyz
        </p>
      ))}
    </section>
  )
}
