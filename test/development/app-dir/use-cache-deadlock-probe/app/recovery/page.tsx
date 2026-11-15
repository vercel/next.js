import { Suspense } from 'react'

// `Quick` resolves comfortably after the 10s probe-idle threshold so its
// chunk arrives _during_ the probe; `Slow` resolves shortly after so the
// fill settles before any rescheduled probe could run.
async function Quick() {
  await new Promise((resolve) => setTimeout(resolve, 11_000))
  return <p id="quick">quick</p>
}

async function Slow() {
  await new Promise((resolve) => setTimeout(resolve, 14_000))
  return <p id="slow">slow</p>
}

async function getCachedData() {
  'use cache'

  return (
    <>
      <Suspense fallback={null}>
        <Quick />
      </Suspense>
      <Slow />
    </>
  )
}

async function Cached() {
  return await getCachedData()
}

export default function Page() {
  return <Cached />
}
