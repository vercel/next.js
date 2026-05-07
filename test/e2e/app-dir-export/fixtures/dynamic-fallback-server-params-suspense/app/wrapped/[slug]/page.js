import { Suspense } from 'react'

async function ParamContent({ params }) {
  const { slug } = await params

  return <h1>{slug}</h1>
}

export default function WrappedDynamicServerPage({ params }) {
  return (
    <Suspense fallback={<p>loading</p>}>
      <ParamContent params={params} />
    </Suspense>
  )
}
