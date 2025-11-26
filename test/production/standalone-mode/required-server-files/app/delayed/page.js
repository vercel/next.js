import { Suspense } from 'react'
import { cookies } from 'next/headers'

export default function Page() {
  return (
    <>
      <p>delayed page</p>

      <Suspense fallback={'loading 1...'}>
        <Time />
      </Suspense>

      <Suspense fallback={'loading 2...'}>
        <Random />
      </Suspense>
    </>
  )
}

async function Time() {
  await cookies()
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return <p id="time">{Date.now()}</p>
}

async function Random() {
  await cookies()
  await new Promise((resolve) => setTimeout(resolve, 4000))
  return <p id="random">{Math.random()}</p>
}
