import { headers, cookies } from 'next/headers'
import { tenant as rootTenant } from 'next/root-params'
import Client from './Client'
export default async function Values({ role, params, searchParams }) {
  const p = await params
  const h = await headers()
  const c = await cookies()
  const root = await rootTenant()
  const q = await searchParams
  const request = h.get('x-parallel-request')
  const values = {
    role,
    tenant: p.tenant,
    item: p.item ?? null,
    root,
    tag: q?.tag ?? null,
    header: h.get('x-parallel-proof'),
    cookie: c.get('parallel-session')?.value ?? null,
  }
  return (
    <>
      <pre id={'parallel-' + role}>{JSON.stringify(values)}</pre>
      <Client request={request} />
    </>
  )
}
