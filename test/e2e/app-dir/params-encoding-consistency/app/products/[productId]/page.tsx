import type { Metadata } from 'next'
import { Suspense } from 'react'

type Props = { params: Promise<{ productId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { productId } = await params
  return { title: productId }
}

async function ProductId({ params }: Props) {
  const { productId } = await params
  return <p id="product-id">{productId}</p>
}

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <ProductId params={params} />
    </Suspense>
  )
}
