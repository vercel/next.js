import { getSentinelValue } from '../getSentinelValue'

export default async function Page() {
  return <div id="page">{getSentinelValue()}</div>
}
