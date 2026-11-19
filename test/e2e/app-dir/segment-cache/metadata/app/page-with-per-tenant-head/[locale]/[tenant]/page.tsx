import { Metadata } from 'next'
import { cacheTag } from 'next/cache'

type Params = { locale: string; tenant: string }

async function getTenantTitle(tenant: string) {
  'use cache'
  cacheTag('segment-cache-metadata:tenant:' + tenant)
  return `Tenant: ${tenant}`
}

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
    title: await getTenantTitle(tenant),
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
