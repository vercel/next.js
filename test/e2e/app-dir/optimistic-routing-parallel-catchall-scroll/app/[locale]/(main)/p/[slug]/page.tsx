import { Suspense } from 'react'

async function ProductContent({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <h1 id="heading">Product {slug}</h1>
}

export default function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={null}>
      <ProductContent params={params} />
    </Suspense>
  )
}
