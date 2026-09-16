import { headers } from 'next/headers'

export default async function HeadersPage() {
  const hdrs = await headers()
  return (
    <dl>
      <dt>x-from-proxy</dt>
      <dd id="proxy-header">{hdrs.get('x-from-proxy') ?? 'MISSING'}</dd>
    </dl>
  )
}
