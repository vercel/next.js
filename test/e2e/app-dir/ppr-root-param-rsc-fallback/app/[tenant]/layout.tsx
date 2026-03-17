import { Suspense } from 'react'
import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ tenant: 'tenant-a' }, { tenant: 'tenant-b' }]
}

async function CachedTenantMarker({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  'use cache'

  return (
    <div hidden id="cached-tenant-marker">
      {(await params).tenant}
    </div>
  )
}

async function EnsureTenant({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant } = await params

  if (typeof tenant !== 'string') {
    throw new Error('Failed to read `tenant` from params')
  }

  return null
}

export default function TenantLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ tenant: string }>
}) {
  return (
    <>
      <Suspense>{children}</Suspense>
      <Suspense fallback={null}>
        <CachedTenantMarker params={params} />
      </Suspense>
      <EnsureTenant params={params} />
    </>
  )
}
