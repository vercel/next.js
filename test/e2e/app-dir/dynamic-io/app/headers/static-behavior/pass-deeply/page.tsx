import { Suspense } from 'react'
import { headers } from 'next/headers'

import { getSentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  const pendingHeaders = headers()
  return (
    <section>
      <h1>Deep Header Reader</h1>
      <p>
        This component was passed the headers promise returned by `headers()`.
        It is rendered inside a Suspense boundary and it takes a second to
        resolve so when rendering the page you should see the Suspense fallback
        content before revealing the header value even though headers was called
        at the page root.
      </p>
      <p>
        If dynamicIO is turned off the `headers()` call would trigger a dynamic
        point at the callsite and the suspense boundary would also be blocked
        for over one second
      </p>
      <Suspense
        fallback={
          <>
            <p>loading header data...</p>
            <div id="fallback">{getSentinelValue()}</div>
          </>
        }
      >
        <DeepHeaderReader pendingHeaders={pendingHeaders} />
      </Suspense>
    </section>
  )
}

async function DeepHeaderReader({
  pendingHeaders,
}: {
  pendingHeaders: ReturnType<typeof headers>
}) {
  let output: Array<React.ReactNode> = []
  for (const [name, value] of await pendingHeaders) {
    if (name.startsWith('x-sentinel')) {
      output.push(
        <tr>
          <td>{name}</td>
          <td>{value}</td>
        </tr>
      )
    }
  }
  await new Promise((r) => setTimeout(r, 1000))
  return (
    <>
      <table>
        <tr>
          <th>Header Name</th>
          <th>Header Value</th>
        </tr>
        {output}
      </table>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}
