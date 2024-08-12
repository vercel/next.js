import { cookies } from 'next/headers'

export default async function Page() {
  return (
    <>
      <p>
        This page calls `cookies()` in a child component that isn't wrapped in a
        Suspense boundary. It will not produce a partially static shell because
        the prerender could not produce a shell
      </p>
      <ComponentThatReadsCookies />
      <OtherComponent />
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
