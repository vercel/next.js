import 'server-only'
import { headers, cookies } from 'next/headers'
import { tenant as rootTenant } from 'next/root-params'
import { after } from 'next/server'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { completedRequests } from './state'
import Client from './Client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function Pending() {
  await new Promise(() => {})
  return null
}

export default async function Page({ params, searchParams }) {
  const values = await params
  const query = await searchParams
  const requestHeaders = await headers()
  const requestCookies = await cookies()
  const root = await rootTenant()
  const request = requestHeaders.get('x-route-request')
  after(async () => {
    await Promise.resolve()
    completedRequests.push(request)
    console.log('ANCESTOR_AFTER ' + request)
  })
  if (query.missing === '1') notFound()
  if (query.hold === '1') {
    return (
      <Suspense fallback={<p id="ancestor-pending">Pending</p>}>
        <Pending />
      </Suspense>
    )
  }
  return (
    <>
      <div id="ancestor-values">
        {JSON.stringify({
          tenant: values.tenant,
          slug: values.slug,
          root,
          tag: query.tag,
          unicode: query.unicode,
          header: requestHeaders.get('x-route-proof'),
          cookie: requestCookies.get('route-session')?.value ?? null,
        })}
      </div>
      <Client request={request} />
    </>
  )
}
