import { Suspense } from 'react'

async function ProductNavContent({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <nav id="desktop-nav">Product nav {slug}</nav>
}

export default function ProductNav({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={null}>
      <ProductNavContent params={params} />
    </Suspense>
  )
}
