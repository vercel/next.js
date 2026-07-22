import { headers } from 'next/headers'

export default async function Page() {
  const requestHeaders = await headers()
  const response = await fetch(
    `http://${requestHeaders.get('host')}/api/data`,
    { cache: 'no-store' }
  )

  return <p>{await response.text()}</p>
}
