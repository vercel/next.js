import { Suspense } from 'react'

export const unstable_paramMatching = {
  top: 'blocking',
  bottom: 'fallback',
}

async function Bottom({ params }) {
  const { bottom } = await params
  return <p>{bottom}</p>
}

export default function Page({ params }) {
  return (
    <Suspense fallback={<p>unknown bottom</p>}>
      <Bottom params={params} />
    </Suspense>
  )
}
