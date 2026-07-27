import { Suspense } from 'react'
import { connection } from 'next/server'

export function generateStaticParams() {
  return [{ slug: 'first-cookie' }, { slug: 'second-cookie' }]
}

async function Postpone({ children }) {
  await connection()
  return children
}

export default async function Page({ params }) {
  const random = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    { cache: 'force-cache' }
  ).then((res) => res.text())

  return (
    <>
      <p id="random">{random}</p>
      <Suspense>
        <Postpone>
          <p id="page">/rewrite/[slug]</p>
          <p id="params">{JSON.stringify(await params)}</p>
          <p id="now">{Date.now()}</p>
        </Postpone>
      </Suspense>
    </>
  )
}
