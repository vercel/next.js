import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProductView } from '@/components/product-view'
import { getProduct, products } from '@/lib/catalog'

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: PageProps<'/products/[slug]'>): Promise<Metadata> {
  return { title: getProduct((await params).slug)?.name }
}

export default async function ProductPage({
  params,
}: PageProps<'/products/[slug]'>) {
  const product = getProduct((await params).slug)
  if (!product) notFound()
  return <ProductView product={product} catalog={products} />
}
