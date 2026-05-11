import { headers } from 'next/headers'

export default async function HeadersPage() {
  const requestHeaders = await headers()

  return <h1>{requestHeaders.get('user-agent')}</h1>
}
