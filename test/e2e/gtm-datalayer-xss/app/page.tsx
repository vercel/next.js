import { GoogleTagManager } from '@next/third-parties/google'
import { Suspense } from 'react'

async function Component({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  return (
    <>
      <p id="probe">q = {q ?? ''}</p>
      <GoogleTagManager gtmId="GTM-XYZ" dataLayer={{ q: q ?? '' }} />
    </>
  )
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  return (
    <Suspense fallback="waiting for request">
      <Component searchParams={searchParams} />
    </Suspense>
  )
}
