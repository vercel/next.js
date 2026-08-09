const generatedProducts = [
  { locale: 'en', slug: 'a' },
  { locale: 'fr', slug: 'b' },
]

export const dynamicParams = false

export function generateStaticParams() {
  return generatedProducts
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  console.log(`[closed-route-metadata] ${locale}/${slug}`)
  return { title: `${locale}/${slug}` }
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  console.log(`[closed-route-page] ${locale}/${slug}`)

  if (
    !generatedProducts.some(
      (product) => product.locale === locale && product.slug === slug
    )
  ) {
    throw new Error(`UNKNOWN_CLOSED_ROUTE_RENDERED: ${locale}/${slug}`)
  }

  return (
    <p id="closed-route-page">
      Product {locale}/{slug}
    </p>
  )
}
