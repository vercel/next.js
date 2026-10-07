import { Suspense } from 'react'
import { connection } from 'next/server'
import { Thrower } from './thrower'

async function Dynamic() {
  await connection()
  return <Thrower />
}

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p id="fallback">fallback</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}
