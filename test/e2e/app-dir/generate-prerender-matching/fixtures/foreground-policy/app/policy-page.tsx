import { Suspense } from 'react'

function ShellMarker({ policy }: { policy: 'blocking' | 'fallback' }) {
  return <p data-shell-marker={policy}>{performance.now().toFixed(3)}</p>
}

async function Params({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <p id="params">{slug}</p>
}

export function PolicyPage({
  params,
  policy,
}: {
  params: Promise<{ slug: string }>
  policy: 'blocking' | 'fallback'
}) {
  return (
    <>
      <ShellMarker policy={policy} />
      <Suspense fallback={<p id="shell">waiting for params</p>}>
        <Params params={params} />
      </Suspense>
    </>
  )
}
