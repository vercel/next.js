'use client'
import { payload as bothPagesPayload } from '../../lib/shared-with-both-pages'
import { payload as onePagePayload } from '../../lib/shared-with-one-page'

// This page shares both heavy modules with the worker, `/page-b` only shares one
// of them. The differing sets of chunk groups are what make Turbopack merge the
// two modules into a single chunk with two component chunks.
export default function PageA() {
  return (
    <div>
      <p id="both-pages">{bothPagesPayload.length}</p>
      <p id="one-page">{onePagePayload.length}</p>
    </div>
  )
}
