import { Suspense } from 'react'

async function Params({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <p id="params">{slug}</p>
}

export function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <>
      <p id="shell-marker">{performance.now().toFixed(5)}</p>
      <Suspense fallback={<p id="pending">waiting for params</p>}>
        <Params params={params} />
      </Suspense>
    </>
  )
}
