import { Suspense } from 'react'
import { createDataFetcher } from '../../lib/data'
import Nav from '../../components/nav'

const Data = createDataFetcher('next_streaming_data', {
  timeout: 500,
})

export default function Page() {
  return (
    <div>
      <div id="content">
        <Suspense fallback="next_streaming_fallback">
          <Data />
        </Suspense>
      </div>
      <div>
        <Nav />
      </div>
    </div>
  )
}
