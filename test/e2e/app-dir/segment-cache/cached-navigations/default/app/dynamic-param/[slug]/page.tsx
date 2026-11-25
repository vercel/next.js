import { connection } from 'next/server'
import { Suspense } from 'react'

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<p id="dynamic-param">Loading...</p>}>
      <DynamicParam params={params} />
    </Suspense>
  )
}

async function DynamicParam({ params }: { params: Promise<{ slug: string }> }) {
  // The param is read only after the render reaches the dynamic stage.
  await connection()
  const { slug } = await params
  return <p id="dynamic-param">{`Param: ${slug}`}</p>
}
