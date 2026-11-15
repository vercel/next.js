import { headers } from 'next/headers'

export default async function HeadersPage() {
  const hdrs = await headers()
  return (
    <dl>
      <dt>x-from-middleware</dt>
      <dd id="middleware-header">
        {hdrs.get('x-from-middleware') ?? 'MISSING'}
      </dd>
    </dl>
  )
}
