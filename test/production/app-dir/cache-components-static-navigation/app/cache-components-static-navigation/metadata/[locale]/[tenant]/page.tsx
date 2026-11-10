type Params = { locale: string; tenant: string }

export function generateStaticParams(): Params[] {
  return [{ locale: 'en', tenant: 'acme' }]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}) {
  const { tenant } = await params
  return { title: 'Tenant: ' + tenant }
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { locale } = await params
  return <p id="value">{'Locale: ' + locale}</p>
}
