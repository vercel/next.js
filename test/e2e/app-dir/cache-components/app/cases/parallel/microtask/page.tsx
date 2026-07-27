import { getSentinelValue } from '../../../getSentinelValue'

export default async function Page() {
  return (
    <>
      <p>static children</p>
      <div id="page-children">{getSentinelValue()}</div>
    </>
  )
}
