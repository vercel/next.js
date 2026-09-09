import { Suspense } from 'react'
import { cookies } from 'next/headers'

async function ReadsCookies() {
  await cookies()
  return <p id="dynamic">Dynamic</p>
}

export default function Home() {
  return (
    <div>
      <p id="static">Home</p>
      <Suspense fallback={<p id="loading">Loading</p>}>
        <ReadsCookies />
      </Suspense>
    </div>
  )
}
