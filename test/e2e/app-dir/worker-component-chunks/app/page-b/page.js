'use client'
import { payload as bothPagesPayload } from '../../lib/shared-with-both-pages'

export default function PageB() {
  return (
    <div>
      <p id="both-pages">{bothPagesPayload.length}</p>
    </div>
  )
}
