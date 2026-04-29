'use client'

import { useEffect, useState } from 'react'

const NONE = '(none)'

export default function ClientComponent() {
  const [pageOrigin, setPageOrigin] = useState<string>(NONE)
  const [workerCtorUrl, setWorkerCtorUrl] = useState<string>(NONE)
  const [workerCtorError, setWorkerCtorError] = useState<string>(NONE)

  useEffect(() => {
    setPageOrigin(window.location.origin)

    // Capture the URL the Worker constructor receives (computed by the
    // turbopack runtime helper from `turbopackWorkerAssetPrefix`), so the
    // test can assert on it. Browsers reject cross-origin Worker URLs
    // synchronously, so we surface that too.
    const OriginalWorker = window.Worker
    ;(window as any).Worker = function PatchedWorker(
      url: URL | string,
      options?: object
    ) {
      const urlString = typeof url === 'string' ? url : url.toString()
      setWorkerCtorUrl(urlString)
      try {
        return new OriginalWorker(url, options)
      } catch (err) {
        setWorkerCtorError(err instanceof Error ? err.name : String(err))
        throw err
      }
    }

    try {
      // Trigger the turbopack `new Worker(new URL(..., import.meta.url))`
      // pattern. Result is intercepted by the patched Worker above.

      new Worker(new URL('./worker.ts', import.meta.url))
    } catch {
      // Already captured by the patched constructor; React state will
      // reflect it on the next render.
    }
    ;(window as any).Worker = OriginalWorker
  }, [])

  return (
    <>
      <p>page origin:</p>
      <pre id="page-origin">{pageOrigin}</pre>
      <p>URL passed to the Worker constructor (from runtime helper):</p>
      <pre id="worker-ctor-url">{workerCtorUrl}</pre>
      <p>Worker constructor error (if any):</p>
      <pre id="worker-ctor-error">{workerCtorError}</pre>
    </>
  )
}
