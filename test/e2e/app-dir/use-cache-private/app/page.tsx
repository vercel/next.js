import { Suspense } from 'react'
import { getSentinelValue } from './sentinel'

export default async function Page() {
  return (
    <>
      <PageSentinel />
      <Suspense fallback={<p>Loading...</p>}>
        <Private />
      </Suspense>
    </>
  )
}

async function PageSentinel() {
  'use cache'

  return (
    <p>
      page: <span id="page-sentinel">{getSentinelValue()}</span>
    </p>
  )
}

async function Private() {
  'use cache: private'

  return (
    <p>
      private: <span id="private-sentinel">{getSentinelValue()}</span>
    </p>
  )
}
