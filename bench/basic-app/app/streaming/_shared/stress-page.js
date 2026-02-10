import React, { Suspense } from 'react'

function sleep(ms) {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createPayload(title, payloadBytes) {
  const prefix = `${title}:`
  if (prefix.length >= payloadBytes) return prefix
  return `${prefix}${'x'.repeat(payloadBytes - prefix.length)}`
}

async function StreamedChunk({ id, delayMs, payload }) {
  await sleep(delayMs)

  return (
    <article data-chunk-id={id}>
      <h2>chunk-{id}</h2>
      <p>{payload}</p>
    </article>
  )
}

export function StreamingStressPage({
  title,
  boundaryCount,
  payloadBytes,
  maxDelayMs,
}) {
  const payload = createPayload(title, payloadBytes)
  const boundaries = Array.from({ length: boundaryCount }, (_, index) => index)

  return (
    <main>
      <h1>{title}</h1>
      <p>
        boundaries={boundaryCount} payloadBytes={payloadBytes} maxDelayMs=
        {maxDelayMs}
      </p>

      {boundaries.map((id) => {
        const delayMs = maxDelayMs === 0 ? 0 : id % (maxDelayMs + 1)

        return (
          <Suspense
            key={id}
            fallback={<div data-fallback-id={id}>loading-{id}</div>}
          >
            <StreamedChunk id={id} delayMs={delayMs} payload={payload} />
          </Suspense>
        )
      })}
    </main>
  )
}
