import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { connection } from 'next/server'

// No instant config on the page — only the layout has it.

export default async function Page() {
  return (
    <main>
      <Suspense fallback={<div>Loading cached...</div>}>
        <CachedWrapper />
      </Suspense>
      <Suspense fallback={<div>Loading dynamic...</div>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function CachedWrapper() {
  const cookieStore = await cookies()
  const value = cookieStore.get('test')?.value ?? 'default'
  return <Cached value={value} />
}

async function Cached({ value }: { value: string }) {
  'use cache'
  return <div id="cached-content">Cached content: {value}</div>
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Dynamic content</div>
}
