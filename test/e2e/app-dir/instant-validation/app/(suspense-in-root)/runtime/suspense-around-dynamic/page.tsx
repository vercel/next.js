import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
}

export default async function Page() {
  return (
    <main>
      <div>
        <p>Runtime content doesn't need a suspense boundary:</p>
        <Runtime />
      </div>

      <div>
        <p>But dynamic content does:</p>
        <Suspense fallback={<div>Loading...</div>}>
          <Dynamic />
        </Suspense>
      </div>
    </main>
  )
}

async function Runtime() {
  await cookies()
  return <div id="runtime-content">Runtime content from page</div>
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Dynamic content from page</div>
}
