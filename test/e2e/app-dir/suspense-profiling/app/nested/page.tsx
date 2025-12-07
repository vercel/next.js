import { Suspense } from 'react'

// Async component with configurable delay
async function AsyncContent({
  id,
  delay,
  children,
}: {
  id: string
  delay: number
  children?: React.ReactNode
}) {
  await new Promise((resolve) => setTimeout(resolve, delay))
  return (
    <div data-testid={`async-${id}`}>
      <span>Async content: {id}</span>
      {children}
    </div>
  )
}

// Deeply nested Suspense structure to test parent-child tracking
function Level1() {
  return (
    <Suspense fallback={<div data-testid="level1-loading">Loading Level 1...</div>}>
      <AsyncContent id="level1" delay={50}>
        <Level2 />
      </AsyncContent>
    </Suspense>
  )
}

function Level2() {
  return (
    <Suspense fallback={<div data-testid="level2-loading">Loading Level 2...</div>}>
      <AsyncContent id="level2" delay={50}>
        <Level3 />
      </AsyncContent>
    </Suspense>
  )
}

function Level3() {
  return (
    <Suspense fallback={<div data-testid="level3-loading">Loading Level 3...</div>}>
      <AsyncContent id="level3" delay={50}>
        <div data-testid="deepest-content">Deepest content reached!</div>
      </AsyncContent>
    </Suspense>
  )
}

// Sibling Suspense boundaries at the same level
function SiblingBoundaries() {
  return (
    <div data-testid="siblings-container">
      <Suspense fallback={<div data-testid="sibling-a-loading">Loading A...</div>}>
        <AsyncContent id="sibling-a" delay={30} />
      </Suspense>

      <Suspense fallback={<div data-testid="sibling-b-loading">Loading B...</div>}>
        <AsyncContent id="sibling-b" delay={60} />
      </Suspense>

      <Suspense fallback={<div data-testid="sibling-c-loading">Loading C...</div>}>
        <AsyncContent id="sibling-c" delay={90} />
      </Suspense>
    </div>
  )
}

export default function NestedPage() {
  return (
    <div data-testid="nested-page-root">
      <h1>Nested Suspense Test</h1>

      <section>
        <h2>Deeply Nested</h2>
        <Level1 />
      </section>

      <section>
        <h2>Sibling Boundaries</h2>
        <SiblingBoundaries />
      </section>
    </div>
  )
}
