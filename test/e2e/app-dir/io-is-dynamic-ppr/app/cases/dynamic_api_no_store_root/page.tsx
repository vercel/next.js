import { unstable_noStore as noStore } from 'next/cache'

export default async function Page() {
  return (
    <>
      <p>
        This page calls `unstable_noStore()` in a child component that isn't
        wrapped in a Suspense boundary. It will not produce a partially static
        shell because the prerender could not produce a shell
      </p>
      <ComponentThatCallsNoStore />
      <OtherComponent />
      <div id="page">{process.env.__TEST_SENTINEL}</div>
    </>
  )
}

async function ComponentThatCallsNoStore() {
  try {
    noStore()
  } catch (e) {
    // swallow any throw. We still want to ensure this is dynamic
  }
  return <div>This component called unstable_noStore()</div>
}

async function OtherComponent() {
  return <div>This component didn't call unstable_noStore()</div>
}
