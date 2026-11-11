import 'server-only'
import { headers, cookies } from 'next/headers'
import { tenant as rootTenant } from 'next/root-params'
export default async function Subject({ params }) {
  const p = await params
  const h = await headers()
  const c = await cookies()
  const root = await rootTenant()
  return (
    <div id="route-values">
      {JSON.stringify({
        tenant: p.tenant,
        slug: p.slug,
        root,
        header: h.get('x-route-proof'),
        cookie: c.get('route-session')?.value ?? null,
      })}
    </div>
  )
}
