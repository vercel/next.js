const generatedResources = [
  { locale: 'en', slug: 'a' },
  { locale: 'fr', slug: 'b' },
]

export const dynamicParams = false

export function generateStaticParams() {
  return generatedResources
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; slug: string }> }
) {
  const { locale, slug } = await params
  console.log(`[closed-route-handler] ${locale}/${slug}`)

  if (
    !generatedResources.some(
      (resource) => resource.locale === locale && resource.slug === slug
    )
  ) {
    throw new Error(`UNKNOWN_CLOSED_HANDLER_RENDERED: ${locale}/${slug}`)
  }

  return Response.json({ locale, slug })
}
