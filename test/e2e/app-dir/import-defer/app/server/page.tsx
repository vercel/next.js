import defer * as neverAccessed from '../../lib/throws-on-evaluation'
import defer * as data from '../../lib/server-data'

// Never called, but keeps the deferred import alive.
function neverCalled() {
  return neverAccessed.value
}

export default async function Page() {
  const dynamicData = await import.defer('../../lib/server-data')
  return (
    <>
      <p id="server-value">{data.value}</p>
      <p id="server-call">{data.getValue()}</p>
      <p id="server-dynamic">{dynamicData.value}</p>
      <p id="server-never-called">{typeof neverCalled}</p>
    </>
  )
}
