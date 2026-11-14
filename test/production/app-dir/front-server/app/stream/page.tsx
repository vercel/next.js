import { Suspense } from 'react'
import { connection } from 'next/server'

async function Slow() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 1500))
  return <p id="slow">slow content</p>
}

export default function Page() {
  return (
    <>
      <p id="shell">shell content</p>
      <Suspense fallback={<p id="fallback">loading</p>}>
        <Slow />
      </Suspense>
    </>
  )
}
