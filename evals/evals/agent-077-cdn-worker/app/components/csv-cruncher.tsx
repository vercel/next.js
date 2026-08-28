'use client'

import { useEffect, useState } from 'react'
import { SAMPLE_LATENCY_CSV } from '../../lib/sample-data'
import type { CrunchResult } from '../../lib/crunch'

export function CsvCruncher() {
  const [result, setResult] = useState<CrunchResult | null>(null)
  const [status, setStatus] = useState<'crunching' | 'done' | 'error'>(
    'crunching'
  )

  useEffect(() => {
    const worker = new Worker(
      new URL('./crunch.worker.ts', import.meta.url),
      { type: 'module' }
    )
    worker.onmessage = (event: MessageEvent<CrunchResult>) => {
      setResult(event.data)
      setStatus('done')
    }
    worker.onerror = () => {
      setStatus('error')
    }
    worker.postMessage(SAMPLE_LATENCY_CSV)
    return () => worker.terminate()
  }, [])

  if (status === 'error') {
    return <p role="alert">The latency cruncher failed to start.</p>
  }
  if (status === 'crunching' || result === null) {
    return <p>Crunching latency report…</p>
  }
  return (
    <dl>
      <dt>Rows</dt>
      <dd>{result.rows}</dd>
      <dt>Average latency (ms)</dt>
      <dd>{result.averageMs}</dd>
      <dt>p95 latency (ms)</dt>
      <dd>{result.p95Ms}</dd>
    </dl>
  )
}
