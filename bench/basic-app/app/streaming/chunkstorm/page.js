import React from 'react'
import { StreamingStressPage } from '../_shared/stress-page'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <StreamingStressPage
      title="stream-chunkstorm"
      boundaryCount={960}
      payloadBytes={192}
      clientPayloadBytes={1024}
      clientPayloadFragments={4}
      maxDelayMs={3}
    />
  )
}
