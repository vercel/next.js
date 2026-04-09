import { Suspense } from 'react'

import { cookies } from 'next/headers'

import { getSentinelValue } from '../../getSentinelValue'

export default async function Page() {
  return (
    <>
      <p>This page calls `cookies()` in a child component.</p>
      <p>
        With PPR this page can be partially static because the dynamic API usage
        is inside a suspense boundary.
      </p>
      <p>
        Without PPR this page is fully dynamic because a dynamic API was used.
      </p>
      <Suspense fallback="loading...">
        <ComponentThatReadsCookies />
      </Suspense>
      <Suspense fallback="loading too...">
        <OtherComponent />
        <div id="inner">{getSentinelValue()}</div>
      </Suspense>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

async function ComponentThatReadsCookies() {
  let sentinelCookie
  try {
    const cookie = (await cookies()).get('x-sentinel')
    if (cookie) {
      sentinelCookie = cookie.value
    } else {
      sentinelCookie = '~not-found~'
    }
  } catch (e) {
    sentinelCookie = '~thrown~'
    // swallow any throw. We should still not be static
  }
  return (
    <div>
      This component read cookies: "<span id="value">{sentinelCookie}</span>"
    </div>
  )
}

async function OtherComponent() {
  return <div>This component didn't read cookies</div>
}
