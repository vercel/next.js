import { cacheLife } from 'next/cache'
import { cookies } from 'next/headers'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Private />
    </Suspense>
  )
}

async function Private() {
  'use cache: private'

  cacheLife({ stale: 420 })
  const cookie = (await cookies()).get('test-cookie')

  const { headers } = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/echo-headers',
    { headers: { 'x-test-cookie': cookie?.value ?? '' } }
  ).then((res) => res.json() as Promise<{ headers: Record<string, string> }>)

  const cookieHeader = headers['x-test-cookie']

  return (
    <pre>
      test-cookie: <span id="test-cookie">{cookieHeader || '<empty>'}</span>
    </pre>
  )
}
