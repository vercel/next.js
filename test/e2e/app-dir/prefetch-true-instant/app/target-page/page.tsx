import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { connection } from 'next/server'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{}],
}

export default async function Page() {
  return (
    <main>
      <Suspense fallback={<div>Loading cached...</div>}>
        <Cached />
      </Suspense>
      <Suspense fallback={<div>Loading dynamic...</div>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Cached() {
  const cookieStore = await cookies()
  const value = cookieStore.get('test')?.value ?? 'default'
  return <div id="cached-content">Cached content: {value}</div>
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Dynamic content</div>
}
