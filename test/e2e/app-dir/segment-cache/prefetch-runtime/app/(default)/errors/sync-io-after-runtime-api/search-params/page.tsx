import { Suspense } from 'react'
import { DebugRenderKind } from '../../../../shared'

type AnySearchParams = { [key: string]: string | string[] | undefined }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AnySearchParams>
}) {
  return (
    <main>
      <DebugRenderKind />
      <p id="intro">
        This page performs sync IO after awaiting searchParams, so we should
        only see the error in a runtime prefetch
      </p>
      <Suspense fallback={<div style={{ color: 'grey' }}>Loading 1...</div>}>
        <RuntimePrefetchable searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function RuntimePrefetchable({
  searchParams,
}: {
  searchParams: Promise<AnySearchParams>
}) {
  await searchParams
  return <div id="timestamp">Timestamp: {Date.now()}</div>
}
