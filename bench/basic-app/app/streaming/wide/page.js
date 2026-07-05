import React from 'react'
import { StreamingStressPage } from '../_shared/stress-page'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <StreamingStressPage
      title="stream-wide"
      boundaryCount={120}
      payloadBytes={8192}
      clientPayloadBytes={16384}
      clientPayloadFragments={8}
      maxDelayMs={6}
    />
  )
}
