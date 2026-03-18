import { getSentinelValue } from '../../../../getSentinelValue'

export default async function Page() {
  await 1
  return (
    <>
      <p>microtask slot</p>
      <div id="page-slot">{getSentinelValue()}</div>
    </>
  )
}
