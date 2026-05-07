import { Suspense } from 'react'
import { getData, preload } from '../shared'

const sharedUrl =
  'https://next-data-api-endpoint.vercel.app/api/random?page=recovery-stuck'

// `Quick` emits a chunk during the first probe's window, which suppresses
// that probe's verdict via the mid-probe recovery check. `Stuck` is
// deadlocked on outer-scope state, so the cache body never settles —
// after the chunk, the scheduler reschedules the idle timer and a second
// probe fires once the fill has been quiet for another threshold. That
// second probe sees no chunks during its own window and correctly
// reports the deadlock.
async function Quick() {
  await new Promise((resolve) => setTimeout(resolve, 11_000))
  return <p id="quick">quick</p>
}

async function Stuck() {
  const data = await getData(sharedUrl).then((res) => res.text())
  return <p id="stuck">{data}</p>
}

async function getCachedData() {
  'use cache'

  return (
    <>
      <Suspense fallback={null}>
        <Quick />
      </Suspense>
      <Suspense fallback={null}>
        <Stuck />
      </Suspense>
    </>
  )
}

async function Cached() {
  try {
    return await getCachedData()
  } catch (error: any) {
    return <p id="result">Error: {error.message}</p>
  }
}

export default function Page() {
  preload(sharedUrl)
  return <Cached />
}
