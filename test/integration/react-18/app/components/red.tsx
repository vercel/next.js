import React, { Suspense } from 'react'
import { createStreamingData } from '../../test/streaming-data'

const Data = createStreamingData()

export default function Styled() {
  return (
    <Suspense fallback={`fallback`}>
      <Data>
        <div>
          <p>This is Red.</p>
          <style jsx>{`
            p {
              color: red;
            }
          `}</style>
        </div>
      </Data>
    </Suspense>
  )
}
