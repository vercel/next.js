import { headers } from 'next/headers'
import { Suspense } from 'react'

export default function Page() {
  return (
    <div>
      <h1>Dynamic Page</h1>
      <Suspense fallback={<p>Loading dynamic page...</p>}>
        <SubComponent />
      </Suspense>
    </div>
  )
}

async function SubComponent() {
  await headers()
  return <div>Dynamic Headers</div>
}

export const metadata = {
  title: 'dynamic page',
}
