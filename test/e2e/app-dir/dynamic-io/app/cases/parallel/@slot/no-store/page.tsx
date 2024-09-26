import { unstable_noStore as noStore } from 'next/cache'

import { getSentinelValue } from '../../../../getSentinelValue'

export default async function Page() {
  noStore()
  return (
    <>
      <p>noStore slot</p>
      <div id="page-slot">{getSentinelValue()}</div>
    </>
  )
}
