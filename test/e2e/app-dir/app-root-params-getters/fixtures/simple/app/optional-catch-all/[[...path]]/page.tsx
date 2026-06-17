import { path } from 'next/root-params'

export default async function Page() {
  return <p>{JSON.stringify({ path: await path() })}</p>
}
