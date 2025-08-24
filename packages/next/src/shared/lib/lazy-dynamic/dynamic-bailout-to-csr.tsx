'use client'

import type { ReactElement } from 'react'
import { BailoutToCSRError } from './bailout-to-csr'

interface BailoutToCSRProps {
  reason: string
  children: ReactElement
}

/**
 * If rendered on the server, this component throws an error
 * to signal Next.js that it should bail out to client-side rendering instead.
 */
export function BailoutToCSR({ reason, children }: BailoutToCSRProps) {
  if (typeof window === 'undefined') {
    throw new BailoutToCSRError(reason)
  }

  return children
}
