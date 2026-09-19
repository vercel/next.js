import { locale, tenant } from 'next/root-params'

export async function generateMetadata() {
  return { title: `Tenant: ${await tenant()}` }
}

export default async function Page() {
  return <main>{`Locale: ${await locale()}`}</main>
}
