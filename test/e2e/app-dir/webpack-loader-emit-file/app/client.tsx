'use client'

import asset from '../fixtures/client.emit'
import mapped from '../fixtures/asset.mapped'

export default function Client() {
  return (
    <>
      <p id="client-asset">{asset}</p>
      <p id="client-mapped-value">{mapped}</p>
    </>
  )
}
