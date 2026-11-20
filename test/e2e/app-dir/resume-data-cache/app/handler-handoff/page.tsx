import { Suspense } from 'react'
import { connection } from 'next/server'
import { revalidateData } from './actions'
import { readData } from './data'

async function DynamicContent() {
  await connection()
  return <p>Dynamic content</p>
}

async function CachedContent() {
  const value = await readData('rdc-handler-handoff')
  return (
    <>
      <p id="handoff-value">{value}</p>
      <form action={revalidateData.bind(null, value)}>
        <button id="revalidate-handoff" type="submit">
          Revalidate cached value
        </button>
      </form>
    </>
  )
}

export default function Page() {
  return (
    <>
      <Suspense fallback={<p>Loading cached content</p>}>
        <CachedContent />
      </Suspense>
      <Suspense fallback={<p>Loading dynamic content</p>}>
        <DynamicContent />
      </Suspense>
    </>
  )
}
