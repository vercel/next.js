import { locale } from 'next/root-params'

export default async function Page() {
  return <main>{`Locale: ${await locale()}`}</main>
}
