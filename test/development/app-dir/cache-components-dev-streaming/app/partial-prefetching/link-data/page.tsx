import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { setTimeout } from 'timers/promises'

async function SessionData() {
  await cookies()
  return <p id="session-data">session content</p>
}

async function LinkData({ searchParams }: { searchParams: Promise<any> }) {
  await searchParams
  return <p id="link-data">link content</p>
}

async function Dynamic() {
  await connection()
  await setTimeout(1000)
  return <p id="dynamic-data">dynamic content</p>
}

export default function Page({ searchParams }: { searchParams: Promise<any> }) {
  return (
    <main>
      <Suspense fallback={<p id="session-fallback">Loading session...</p>}>
        <SessionData />
      </Suspense>
      <Suspense fallback={<p id="link-fallback">Loading link...</p>}>
        <LinkData searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<p id="dynamic-fallback">Loading dynamic...</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}
