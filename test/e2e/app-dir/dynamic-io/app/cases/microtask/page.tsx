import { getSentinelValue } from '../../getSentinelValue'

export default async function Page() {
  await 1
  return (
    <>
      <p>
        This page only has microtask async points and no Suspense boundaries.
      </p>
      <p>With PPR this page should be entirely static.</p>
      <p>Without PPR this page should be static.</p>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}
