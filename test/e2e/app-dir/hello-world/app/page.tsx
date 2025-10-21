import { cookies } from 'next/headers'
import { Suspense } from 'react'

export default function Page() {
  return (
    <main>
      <div>this is static</div>
      <Suspense fallback="loading...">
        <Dynamic />
      </Suspense>
      <Suspense fallback="loading...">
        <Runtime />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return <p>hello dynamic</p>
}

async function Runtime() {
  await cookies()
  return <p>hello runtime</p>
}
