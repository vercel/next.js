import { Suspense } from 'react'
import { connection } from 'next/server'
import { HydrationIndicator } from '../../hydration-indicator'
import waitForMarkerFile from '../../../waitForMarkerFile'
import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  await connection()
  return {
    title: 'Resume test',
  }
}

export default function Page() {
  return (
    <main id="shell">
      <h1>This is a page with static shell + streaming metadata</h1>
      <div>
        <p>Static shell</p>
        <HydrationIndicator id="shell-hydrated" />
        <hr />
        <Suspense fallback={<div id="dynamic-fallback">Loading...</div>}>
          <SlowServerComponent />
        </Suspense>
      </div>
    </main>
  )
}

async function SlowServerComponent() {
  await connection()
  await waitForMarkerFile()
  const randomValue = Math.floor(Math.random() * 1000)
  return (
    <div id="dynamic">
      <div>{`Random value: ${randomValue}`}</div>
      <HydrationIndicator id="dynamic-hydrated" />
    </div>
  )
}
