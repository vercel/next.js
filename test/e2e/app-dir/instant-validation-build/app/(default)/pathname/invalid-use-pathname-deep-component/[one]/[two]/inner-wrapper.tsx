'use client'

import { PathnameReader } from './pathname-reader'

export function InnerWrapper() {
  return (
    <p>
      Current path: <PathnameReader />
    </p>
  )
}
