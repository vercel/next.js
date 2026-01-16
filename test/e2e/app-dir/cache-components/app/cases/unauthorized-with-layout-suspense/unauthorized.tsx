import { getSentinelValue } from '../../getSentinelValue'

export default function Unauthorized() {
  return (
    <>
      <h1 id="unauthorized-heading">401 - Unauthorized</h1>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}
