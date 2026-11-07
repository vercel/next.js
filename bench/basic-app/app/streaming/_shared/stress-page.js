import React, { Suspense } from 'react'

import { StreamingClientBoundary } from './client-boundary'

function sleep(ms) {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createPayload(title, payloadBytes, payloadMarker) {
  const prefix = `${title}:${payloadMarker}`
  if (prefix.length >= payloadBytes) return prefix
  return `${prefix}${'x'.repeat(payloadBytes - prefix.length)}`
}

function createClientPayload({
  title,
  id,
  payloadBytes,
  payloadMarker,
  fragmentCount,
}) {
  const payload = createPayload(
    `${title}-client-${id}`,
    payloadBytes,
    payloadMarker
  )
  const safeFragmentCount = Math.max(1, fragmentCount)
  const fragmentSize = Math.max(
    16,
    Math.floor(payload.length / safeFragmentCount)
  )
  const fragments = Array.from({ length: safeFragmentCount }, (_, index) => {
    const start = Math.min(index * fragmentSize, payload.length)
    const end = Math.min(start + fragmentSize, payload.length)
    return payload.slice(start, end)
  })

  return {
    chunkId: id,
    payload,
    fragments,
    checksum: payload.length + id * 31 + safeFragmentCount,
  }
}

async function StreamedChunk({
  title,
  id,
  delayMs,
  payload,
  payloadMarker,
  clientPayloadBytes,
  clientPayloadFragments,
}) {
  await sleep(delayMs)

  const clientPayload = createClientPayload({
    title,
    id,
    payloadBytes: clientPayloadBytes,
    payloadMarker,
    fragmentCount: clientPayloadFragments,
  })

  return (
    <article data-chunk-id={id}>
      <h2>chunk-{id}</h2>
      <p>{payload}</p>
      <StreamingClientBoundary {...clientPayload} />
    </article>
  )
}

export function StreamingStressPage({
  title,
  boundaryCount,
  payloadBytes,
  // Prepended to every payload. A single character outside Latin-1 makes V8
  // store the whole string in two-byte form, which is the common shape of
  // real text (an em dash or emoji in otherwise ASCII content).
  payloadMarker = '',
  clientPayloadBytes = Math.max(128, Math.floor(payloadBytes / 2)),
  clientPayloadFragments = 4,
  maxDelayMs,
}) {
  const payload = createPayload(title, payloadBytes, payloadMarker)
  const boundaries = Array.from({ length: boundaryCount }, (_, index) => index)

  return (
    <main>
      <h1>{title}</h1>
      <p>
        boundaries={boundaryCount} payloadBytes={payloadBytes}{' '}
        clientPayloadBytes=
        {clientPayloadBytes} clientPayloadFragments={clientPayloadFragments}{' '}
        maxDelayMs={maxDelayMs}
      </p>

      {boundaries.map((id) => {
        const delayMs = maxDelayMs === 0 ? 0 : id % (maxDelayMs + 1)

        return (
          <Suspense
            key={id}
            fallback={<div data-fallback-id={id}>loading-{id}</div>}
          >
            <StreamedChunk
              title={title}
              id={id}
              delayMs={delayMs}
              payload={payload}
              payloadMarker={payloadMarker}
              clientPayloadBytes={clientPayloadBytes}
              clientPayloadFragments={clientPayloadFragments}
            />
          </Suspense>
        )
      })}
    </main>
  )
}
