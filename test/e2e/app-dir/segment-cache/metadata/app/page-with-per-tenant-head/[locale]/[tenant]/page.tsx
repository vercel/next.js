import { Metadata } from 'next'

type Params = { locale: string; tenant: string }

// Only one tenant is prerendered. Any other tenant is rendered on demand, so
// its head is missing from the cache while the body, which reads only the
// locale, can be reused from the prerendered one.
export function generateStaticParams(): Params[] {
  return [{ locale: 'en', tenant: 'acme' }]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { tenant } = await params
  return {
    title: `Tenant: ${tenant}`,
  }
}

export default async function PageWithPerTenantHead({
  params,
}: {
  params: Promise<Params>
}) {
  const { locale } = await params
  return <div id="target-page">{`Locale: ${locale}`}</div>
}
