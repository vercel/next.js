import { headers } from 'next/headers'

export default async function Page() {
  const requestHeaders = await headers()
  return <div>{requestHeaders.get('user-agent')}</div>
}
