import { 'lang-country' as langCountry } from 'next/root-params'

export default async function Page() {
  return <p>hello world {await langCountry()}</p>
}
