import { Suspense } from 'react'

import { getSentinelValue } from '../../getSentinelValue'

import { Time } from './client'

export default function Page() {
  return (
    <>
      <p>
        This page is static in RSC but dynamic in the client. It should serve a
        static fallback that updates in the browser.
      </p>
      <Suspense fallback={<span>Loading...</span>}>
        <Time />
      </Suspense>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}
