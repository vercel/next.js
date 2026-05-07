import { Suspense } from 'react'
import InboxModalClient from './modal-client'

export default function InboxModalPage() {
  return (
    <Suspense fallback={<p id="modal-thread">Loading modal...</p>}>
      <InboxModalClient />
    </Suspense>
  )
}
