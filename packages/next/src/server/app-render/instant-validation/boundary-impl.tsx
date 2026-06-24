/* eslint-disable @next/internal/no-ambiguous-jsx -- React Client */

// Do not put a "use client" directive here. Import this module via the shim in
// `packages/next/src/client/components/instant-validation/boundary.tsx` instead.
// 'use client'

import { createContext, type ReactNode } from 'react'
import { INSTANT_VALIDATION_BOUNDARY_NAME } from './boundary-constants'
import { InvariantError } from '../../../shared/lib/invariant-error'
import type { ValidationBoundaryTracking } from './boundary-tracking'
import { workUnitAsyncStorage } from '../work-unit-async-storage.external'

if (typeof window !== 'undefined') {
  throw new InvariantError(
    'Instant validation boundaries should never appear in browser bundles.'
  )
}

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
    case 'generate-static-params':
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
    // Track which boundaries we actually managed to render.
    const state = getValidationBoundaryTracking()
    if (state === null) {
      throw new InvariantError('Missing boundary tracking state')
    }
    state.renderedIds.add(id)

    return children
  },
}

type BoundaryPlacement =
  | null // do not place here
  | string // boundaryId -- place here

export const InstantValidationBoundaryContext =
  createContext<BoundaryPlacement>(null)

export function PlaceValidationBoundaryBelowThisLevel({
  id,
  children,
}: {
  id: string
  children: ReactNode
}) {
  return (
    // OuterLayoutRouter will see this and render a `RenderValidationBoundaryAtThisLevel`.
    <InstantValidationBoundaryContext value={id}>
      {children}
    </InstantValidationBoundaryContext>
  )
}

export function RenderValidationBoundaryAtThisLevel({
  id,
  children,
}: {
  id: string
  children: ReactNode
}) {
  // We got a boundaryId from the context. Clear the context so that the children don't render another boundary.
  return (
    <InstantValidationBoundary id={id}>
      <InstantValidationBoundaryContext value={null}>
        {children}
      </InstantValidationBoundaryContext>
    </InstantValidationBoundary>
  )
}

const InstantValidationBoundary =
  // We use slice(0) to trick the bundler into not inlining/minifying the function
  // so it retains the name inferred from the namespace object
  NameSpace[
    INSTANT_VALIDATION_BOUNDARY_NAME.slice(
      0
    ) as typeof INSTANT_VALIDATION_BOUNDARY_NAME
  ]

// Slot marker component for attributing validation errors to the
// correct config when a boundary spans multiple parallel slots.
// Renders a dynamically-named inner component so the slot index
// appears in the SSR component stack (__next_instant_slot_N__).
const slotMarkerCache = new Map<
  string,
  (props: { children: ReactNode }) => ReactNode
>()

export function SlotMarker({
  name,
  children,
}: {
  name: string
  children: ReactNode
}) {
  let Marker = slotMarkerCache.get(name)
  if (!Marker) {
    const ns = {
      [name]: function ({ children: c }: { children: ReactNode }) {
        return c
      },
    }
    Marker = ns[name]
    slotMarkerCache.set(name, Marker)
  }
  return <Marker>{children}</Marker>
}
