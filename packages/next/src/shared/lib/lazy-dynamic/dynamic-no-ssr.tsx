'use client'

import type React from 'react'
import { BailoutToCSRError } from './bailout-to-csr'

type Child = React.ReactElement<any, any>

export function NoSSR({ children }: { children: Child }): Child {
  if (typeof window === 'undefined') {
    throw new BailoutToCSRError()
  }

  return children
}
