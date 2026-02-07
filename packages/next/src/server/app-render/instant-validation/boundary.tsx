'use client'

import type { ReactNode } from 'react'
import { INSTANT_VALIDATION_BOUNDARY_NAME } from './boundary-constants'

// We use a namespace object to allow us to recover the name of the function
// at runtime even when production bundling/minification is used.
const NameSpace = {
  [INSTANT_VALIDATION_BOUNDARY_NAME]: function ({
    children,
  }: {
    children: ReactNode
  }) {
    return children
  },
}

export const InstantValidationBoundary =
  // We use slice(0) to trick the bundler into not inlining/minifying the function
  // so it retains the name inferred from the namespace object
  NameSpace[
    INSTANT_VALIDATION_BOUNDARY_NAME.slice(
      0
    ) as typeof INSTANT_VALIDATION_BOUNDARY_NAME
  ]
