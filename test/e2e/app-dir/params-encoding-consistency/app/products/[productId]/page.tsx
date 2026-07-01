import type { Metadata } from 'next'

type Props = { params: Promise<{ productId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { productId } = await params
  return { title: productId }
}

export default async function Page({ params }: Props) {
  const { productId } = await params
  return <p id="product-id">{productId}</p>
}
