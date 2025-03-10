import { Suspense } from 'react'
import { cookies } from 'next/headers'

import { getSentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  const pendingCookies = cookies()
  return (
    <section>
      <h1>Deep Cookie Reader</h1>
      <p>
        This component was passed the cookies promise returned by `cookies()`.
        It is rendered inside a Suspense boundary and it takes a second to
        resolve so when rendering the page you should see the Suspense fallback
        content before revealing the cookie value even though cookies was called
        at the page root.
      </p>
      <p>
        If dynamicIO is turned off the `cookies()` call would trigger a dynamic
        point at the callsite and the suspense boundary would also be blocked
        for over one second
      </p>
      <Suspense
        fallback={
          <>
            <p>loading cookie data...</p>
            <div id="fallback">{getSentinelValue()}</div>
          </>
        }
      >
        <DeepCookieReader pendingCookies={pendingCookies} />
      </Suspense>
    </section>
  )
}

async function DeepCookieReader({
  pendingCookies,
}: {
  pendingCookies: ReturnType<typeof cookies>
}) {
  let output: Array<React.ReactNode> = []
  for (const [name, cookie] of await pendingCookies) {
    if (name.startsWith('x-sentinel')) {
      output.push(
        <tr>
          <td>{name}</td>
          <td>{cookie.value}</td>
        </tr>
      )
    }
  }
  await new Promise((r) => setTimeout(r, 1000))
  return (
    <>
      <table>
        <tr>
          <th>Cookie name</th>
          <th>Cookie Value</th>
        </tr>
        {output}
      </table>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}
