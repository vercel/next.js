import { Suspense } from 'react'

async function ParamContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <p id="param-content">Param value: {slug}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <>
      <p id="static-content">Static page content</p>
      <Suspense fallback={<p id="param-fallback">Loading param...</p>}>
        <ParamContent params={params} />
      </Suspense>
    </>
  )
}

export function generateStaticParams() {
  return [{ slug: 'param-marker-alpha' }]
}
