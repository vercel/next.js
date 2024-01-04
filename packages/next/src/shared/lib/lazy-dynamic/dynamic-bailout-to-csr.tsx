'use client'

import type { ReactElement } from 'react'
import { BailoutToCSRError } from './bailout-to-csr'

interface BailoutToCSRProps {
  reason: string
  children: ReactElement
}

export function BailoutToCSR({ reason, children }: BailoutToCSRProps) {
  if (typeof window === 'undefined') {
    throw new BailoutToCSRError(reason)
  }

  return children
}
