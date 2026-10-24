import { notFound } from 'next/navigation'

const KNOWN_BRANDS = ['apple']

export const dynamicParams = false

export function generateStaticParams() {
  return KNOWN_BRANDS.map((brand) => ({ brand }))
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ brand: string }>
}) {
  const { brand } = await params
  if (!KNOWN_BRANDS.includes(brand)) {
    notFound()
  }
  return <p>Brand: {brand}</p>
}
