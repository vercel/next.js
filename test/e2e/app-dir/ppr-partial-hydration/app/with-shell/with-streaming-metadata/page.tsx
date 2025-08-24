import { Suspense } from 'react'
import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'
import { HydrationIndicator } from '../../hydration-indicator'
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
          <SlowServerComponent delay={500} />
        </Suspense>
      </div>
    </main>
  )
}

async function SlowServerComponent({ delay }: { delay: number }) {
  await connection()
  await setTimeout(delay)
  const randomValue = Math.floor(Math.random() * 1000)
  return (
    <div id="dynamic">
      <div>{`Random value: ${randomValue}`}</div>
      <HydrationIndicator id="dynamic-hydrated" />
    </div>
  )
}
