import { Suspense } from 'react'
import { cookies } from 'next/headers'

export default async function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Foobar />
    </Suspense>
  )
}

async function Foobar() {
  try {
    cookies()
  } catch (err) {
    console.log('User land logged error: ' + err.message)
  }
  cookies() // still postpones so doesn't fail build
  return null
}
