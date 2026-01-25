import { unstable_noStore as noStore } from 'next/cache'

import { getSentinelValue } from '../../../../getSentinelValue'

export default async function Page() {
  // We wait for metadata to finish before calling noStore
  await new Promise((r) => process.nextTick(r))
  noStore()
  return (
    <>
      <p>noStore slot</p>
      <div id="page-slot">{getSentinelValue()}</div>
    </>
  )
}
