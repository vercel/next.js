import { Suspense } from 'react'

// An async server component that resolves after a short delay, so on the first
// (uncached) navigation its content streams in behind the Suspense boundary
// below. The hash target lives inside it, so it is NOT in the DOM at the moment
// the router would normally scroll to the hash.
async function SlowCategories() {
  await new Promise((resolve) => setTimeout(resolve, 150))
  return (
    <div>
      {/* Push the target well below the fold so a real scroll is required. */}
      <div style={{ height: '150vh' }}>Categories loaded</div>
      <h2 id="hash-target">Hash target (was inside Suspense)</h2>
      <div style={{ height: '150vh' }} />
    </div>
  )
}

export default function WithSuspensePage() {
  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: '16px' }}>
      <p>With Suspense</p>
      <Suspense fallback={<p id="fallback">Loading categories…</p>}>
        <SlowCategories />
      </Suspense>
    </div>
  )
}
