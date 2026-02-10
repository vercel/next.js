import React from 'react'
import { StreamingStressPage } from '../_shared/stress-page'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <StreamingStressPage
      title="stream-medium"
      boundaryCount={96}
      payloadBytes={1024}
      maxDelayMs={4}
    />
  )
}
