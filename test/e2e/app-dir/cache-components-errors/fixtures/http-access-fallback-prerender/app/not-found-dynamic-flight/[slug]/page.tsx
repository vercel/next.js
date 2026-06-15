import { Suspense } from 'react'
import { cookies } from 'next/headers'

export function generateStaticParams() {
  return [{ slug: 'not-found' }]
}

export default function Page() {
  return (
    <Suspense fallback={<p>loading dynamic flight</p>}>
      <DynamicCookieValue />
    </Suspense>
  )
}

async function DynamicCookieValue() {
  const value =
    (await cookies()).get('http-access-fallback-prerender')?.value ?? 'missing'

  return <p>dynamic cookie value: {value}</p>
}
