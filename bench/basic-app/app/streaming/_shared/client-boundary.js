'use client'

import React from 'react'

export function StreamingClientBoundary({
  chunkId,
  payload,
  fragments,
  checksum,
}) {
  return (
    <section data-client-boundary={chunkId}>
      <h3>client-{chunkId}</h3>
      <p>checksum:{checksum}</p>
      <p>payload-bytes:{payload.length}</p>
      <p>fragment-count:{fragments.length}</p>
      <p>{fragments[0] ?? ''}</p>
    </section>
  )
}
