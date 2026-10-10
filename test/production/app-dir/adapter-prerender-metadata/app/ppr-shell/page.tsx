import { Suspense } from 'react'
import { headers } from 'next/headers'

async function Dynamic() {
  const requestHeaders = await headers()
  return <div>{requestHeaders.get('user-agent')}</div>
}

export default function Page() {
  return (
    <div>
      <p>static shell content</p>
      <Suspense fallback={<div>Loading...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}
