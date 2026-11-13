import { connection, after } from 'next/server'
import { Suspense } from 'react'

async function Hang() {
  await connection()
  await new Promise(() => {})
  return null
}
export default function Page() {
  after(() => {
    console.log('[test-sync]:hang-request-closed')
  })
  return (
    <Suspense fallback={<p>stream-started</p>}>
      <Hang />
    </Suspense>
  )
}
