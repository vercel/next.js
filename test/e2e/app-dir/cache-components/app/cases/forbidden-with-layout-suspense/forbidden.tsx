import { getSentinelValue } from '../../getSentinelValue'

export default function Forbidden() {
  return (
    <>
      <h1 id="forbidden-heading">403 - Forbidden</h1>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}
