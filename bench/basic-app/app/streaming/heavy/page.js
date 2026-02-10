import React from 'react'
import { StreamingStressPage } from '../_shared/stress-page'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <StreamingStressPage
      title="stream-heavy"
      boundaryCount={240}
      payloadBytes={1536}
      maxDelayMs={8}
    />
  )
}
