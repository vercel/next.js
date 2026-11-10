import { Instant } from 'next'
import { cookies } from 'next/headers'

export const instant: Instant = { level: 'experimental-error' }

export default async function Page() {
  await loadOuter()
  return (
    <main>
      <p>
        This page awaits a couple blocking (runtime, then dynamic) things in
        sequence. We should point to the first one as the cause.
      </p>
    </main>
  )
}

async function loadOuter() {
  await cookies() // 1 (correct)
  await loadInner()
}

async function loadInner() {
  await new Promise((resolve) => setTimeout(resolve)) // 2 (not correct, but expected)
  await new Promise((resolve) => setTimeout(resolve)) // 3 (incorrect)
}
