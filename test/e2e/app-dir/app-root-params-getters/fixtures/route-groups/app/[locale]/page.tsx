import { locale } from 'next/root-params'

export default async function Page() {
  return <p>hello world {JSON.stringify({ locale: await locale() })}</p>
}
