import { headers } from 'next/headers'

export default async function Page() {
  return (
    <>
      <p>
        This page calls `headers()` in a child component that isn't wrapped in a
        Suspense boundary. It will not produce a partially static shell because
        the prerender could not produce a shell
      </p>
      <ComponentThatReadsHeaders />
      <OtherComponent />
      <div id="page">{process.env.__TEST_SENTINEL}</div>
    </>
  )
}

async function ComponentThatReadsHeaders() {
  let sentinelHeader
  try {
    sentinelHeader = headers().get('x-sentinel')
    if (!sentinelHeader) {
      sentinelHeader = '~not-found~'
    }
  } catch (e) {
    sentinelHeader = '~thrown~'
    // swallow any throw. We should still not be static
  }
  return (
    <div>
      This component read headers: "<span id="value">{sentinelHeader}</span>"
    </div>
  )
}

async function OtherComponent() {
  return <div>This component didn't read headers</div>
}
