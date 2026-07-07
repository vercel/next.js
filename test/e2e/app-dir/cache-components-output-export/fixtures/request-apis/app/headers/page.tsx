import { headers } from 'next/headers'

export default async function Page() {
  const h = await headers()
  return <p>{h.get('user-agent') ?? 'none'}</p>
}
