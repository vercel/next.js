import React from 'react'
import { StreamingStressPage } from '../_shared/stress-page'

export const dynamic = 'force-dynamic'

// Same shape as /streaming/heavy with two-byte payload strings.
export default function Page() {
  return (
    <StreamingStressPage
      title="stream-heavy-unicode"
      boundaryCount={240}
      payloadBytes={1536}
      payloadMarker="中"
      clientPayloadBytes={3072}
      clientPayloadFragments={6}
      maxDelayMs={8}
    />
  )
}
