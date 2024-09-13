import { getSentinelValue } from '../../getSentinelValue'

export default async function Page() {
  await 1
  return (
    <>
      <p>
        This page renders a component that requires async IO. It is simulated
        using setTimeout(f, 1000).
      </p>
      <p>
        This simulated IO component does not have a parent suspense boundary
      </p>
      <p>
        With PPR this page should have an empty static shell because uncached
        "IO" was used without a parent Suspense boundary.
      </p>
      <p>Without PPR this page should be dynamic.</p>
      <ComponentWithIO />
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

async function ComponentWithIO() {
  await new Promise<void>((r) => setTimeout(r, 1000))
  return <p>hello IO</p>
}
