import { Suspense } from 'react'
import { DialogContent } from '../../dialog-content'

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  return (
    <Suspense fallback={<p id="page-loading">loading</p>}>
      <DialogContent basePath="/items" searchParams={searchParams} />
    </Suspense>
  )
}
