import { headers } from 'next/headers'

export default async function Page() {
  await headers()
  return <p>{'headers()'}</p>
}
