import { Suspense } from 'react'
import { DialogContent } from '../../../dialog-content'

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  return (
    <div id="modal">
      <Suspense fallback={<p id="dialog-loading">loading</p>}>
        <DialogContent basePath="/prefetch" searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
