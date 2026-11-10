import React from 'react'
import { StreamingStressPage } from '../_shared/stress-page'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <StreamingStressPage
      title="stream-light"
      boundaryCount={24}
      payloadBytes={512}
      clientPayloadBytes={384}
      clientPayloadFragments={2}
      maxDelayMs={2}
    />
  )
}
