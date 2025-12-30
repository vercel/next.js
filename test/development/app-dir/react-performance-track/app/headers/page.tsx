import { headers } from 'next/headers'

export default async function HeadersPage() {
  await headers()

  return <p>Done headers</p>
}
