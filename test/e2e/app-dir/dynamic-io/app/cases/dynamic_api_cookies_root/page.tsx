import { cookies } from 'next/headers'

import { getSentinelValue } from '../../getSentinelValue'

export default async function Page() {
  return (
    <>
      <p>
        This page calls `cookies()` in a child component without a parent
        Suspense boundary
      </p>
      <p>
        With PPR this page has an empty shell because the dynamic API usage is
        not inside a Suspense boundary.
      </p>
      <p>
        Without PPR this page is fully dynamic because a dynamic API was used.
      </p>
      <ComponentThatReadsCookies />
      <OtherComponent />
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
