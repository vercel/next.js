import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { createStreamingData } from '../../test/streaming-data'

const Foo = dynamic(() => import('./foo'), {
  suspense: true,
})

const Data = createStreamingData('bar')

export default function Bar() {
  return (
    <div>
      <Suspense>
        <Data />
      </Suspense>
      <Suspense fallback={'fallback'}>
        <Foo />
      </Suspense>
    </div>
  )
}
