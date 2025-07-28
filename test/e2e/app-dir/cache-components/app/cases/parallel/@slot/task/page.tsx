import { getSentinelValue } from '../../../../getSentinelValue'

export default async function Page() {
  await new Promise((r) => setTimeout(r, 0))
  return (
    <>
      <p>task slot</p>
      <div id="page-slot">{getSentinelValue()}</div>
    </>
  )
}
