import { Suspense } from 'react'

async function Dynamic() {
  // Uncached I/O: this resolves past the static stage, so it becomes a dynamic
  // hole that would need a server to fill. That's not possible with
  // `output: 'export'`.
  await new Promise((resolve) => setTimeout(resolve, 50))
  return <p id="dynamic">resolved</p>
}

export default function Page() {
  return (
    <main>
      <p id="static">static shell</p>
      <Suspense fallback={<p id="fallback">loading…</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}
