'use client'

import type { ReactNode } from 'react'
import { INSTANT_VALIDATION_BOUNDARY_NAME } from './boundary-constants'
import { InvariantError } from '../../../shared/lib/invariant-error'
import { workUnitAsyncStorage } from '../work-unit-async-storage.external'
import type { ValidationBoundaryTracking } from './boundary-tracking'

function getValidationBoundaryTracking(): ValidationBoundaryTracking | null {
  const store = workUnitAsyncStorage.getStore()
  if (!store) return null
  switch (store.type) {
    case 'validation-client':
      return store.boundaryState
    case 'prerender':
    case 'prerender-client':
    case 'prerender-ppr':
    case 'prerender-legacy':
    case 'prerender-runtime':
    case 'request':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
      break
    default:
      store satisfies never
  }
  return null
}

// We use a namespace object to allow us to recover the name of the function
// at runtime even when production bundling/minification is used.
const NameSpace = {
  [INSTANT_VALIDATION_BOUNDARY_NAME]: function ({
    id,
    children,
  }: {
    id: string
    children: ReactNode
  }) {
    if (typeof window !== 'undefined') {
      throw new InvariantError(
        'InstantValidationBoundary should only be rendered in SSR'
      )
    }

    // Track which boundaries we actually managed to render.
    const state = getValidationBoundaryTracking()
    if (state === null) {
      throw new InvariantError('Missing boundary tracking state')
    }
    state.renderedIds.add(id)

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
