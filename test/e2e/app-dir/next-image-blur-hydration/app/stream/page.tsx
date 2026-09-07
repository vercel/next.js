import { Suspense } from 'react'
import { connection } from 'next/server'
import Images from '../../components/images'
import HydrationGate from '../../components/hydration-gate'
import { streamControl } from '../../components/stream-control'

async function StreamedImages() {
  await new Promise<void>((resolve) => {
    streamControl.releaseImageStream = resolve
  })
  return (
    <HydrationGate>
      <Images />
    </HydrationGate>
  )
}

export default async function Page() {
  await connection()
  return (
    <Suspense
      fallback={
        <>
          <p id="stream-fallback">Waiting for images</p>
          {/* Cross WebKit's buffering threshold even with this tiny shell. */}
          <span hidden>{'padding '.repeat(256)}</span>
        </>
      }
    >
      <StreamedImages />
    </Suspense>
  )
}
