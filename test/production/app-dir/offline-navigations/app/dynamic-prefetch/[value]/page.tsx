import { Suspense } from 'react'
import { OfflineStatus } from '../../offline-status'
import { DynamicPrefetchValue } from './dynamic-prefetch-value'

export function generateStaticParams() {
  return [{ value: '__TEST__' }]
}

export default function DynamicPrefetchPage() {
  return (
    <>
      <Suspense fallback={<p>loading dynamic prefetch value</p>}>
        <DynamicPrefetchValue />
      </Suspense>
      <OfflineStatus />
    </>
  )
}
