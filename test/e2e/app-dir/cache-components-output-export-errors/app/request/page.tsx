import { headers } from 'next/headers'
import { Suspense } from 'react'

async function Content() {
  return <p>{(await headers()).get('user-agent')}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Content />
    </Suspense>
  )
}
