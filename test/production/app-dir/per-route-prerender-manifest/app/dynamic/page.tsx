import { Suspense } from 'react'
import { connection } from 'next/server'

async function Dynamic() {
  await connection()
  return <p>app dynamic page</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <Dynamic />
    </Suspense>
  )
}
