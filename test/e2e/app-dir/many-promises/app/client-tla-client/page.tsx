'use client'

const p = Promise.resolve()

if (typeof window !== 'undefined') {
  // Client only: measure performance in the browser (no async_hooks)
  const t0 = Date.now()
  for (let chunk = 0; chunk < 2 ** 4; chunk++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    const chunkStart = Date.now()
    for (let i = 0; i < 2 ** 16; i++) {
      await p
    }
    console.log(
      `[client-tla-client] chunk ${chunk}: ${Date.now() - chunkStart}ms (total: ${Date.now() - t0}ms)`
    )
  }
}

// Always 'done' on both SSR and client to avoid hydration mismatch
const result = 'done'

export default function Page() {
  return <p>{result}</p>
}
