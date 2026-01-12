import { Suspense } from 'react'

// Simulate an async component that might trigger console.error during suspense
async function AsyncContent() {
  // Simulate async work
  await new Promise((resolve) => setTimeout(resolve, 100))

  return <div id="content">Loaded</div>
}

export default function SuspenseErrorPage() {
  return (
    <div>
      <h1>Suspense Error Test</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <AsyncContent />
      </Suspense>
    </div>
  )
}
