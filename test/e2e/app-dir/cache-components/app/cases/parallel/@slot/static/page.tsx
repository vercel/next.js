import { getSentinelValue } from '../../../../getSentinelValue'

export default async function Page() {
  return (
    <>
      <p>static slot</p>
      <div id="page-slot">{getSentinelValue()}</div>
    </>
  )
}
