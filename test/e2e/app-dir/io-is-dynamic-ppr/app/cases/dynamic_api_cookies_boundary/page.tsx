import { Suspense } from 'react'

import { cookies } from 'next/headers'

export default async function Page() {
  return (
    <>
      <p>
        This page calls `cookies()` in a child component but because this
        component is inside a Suspense boundary the shell is still static.
      </p>
      <Suspense fallback="loading...">
        <ComponentThatReadsCookies />
      </Suspense>
      <Suspense fallback="loading too...">
        <OtherComponent />
      </Suspense>
      <div id="page">{process.env.__TEST_SENTINEL}</div>
    </>
  )
}

async function ComponentThatReadsCookies() {
  let sentinelCookie
  try {
    const cookie = cookies().get('sentinel')
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
