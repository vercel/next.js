'use client'

import type { ReactNode } from 'react'
import {
  METADATA_BOUNDARY_NAME,
  VIEWPORT_BOUNDARY_NAME,
  OUTLET_BOUNDARY_NAME,
  ROOT_LAYOUT_BOUNDARY_NAME,
} from './boundary-constants'

// We use a namespace object to allow us to recover the name of the function
// at runtime even when production bundling/minification is used.
const NameSpace = {
  [METADATA_BOUNDARY_NAME]: function ({ children }: { children: ReactNode }) {
    return children
  },
  [VIEWPORT_BOUNDARY_NAME]: function ({ children }: { children: ReactNode }) {
    return children
  },
  [OUTLET_BOUNDARY_NAME]: function ({ children }: { children: ReactNode }) {
    return children
  },
  [ROOT_LAYOUT_BOUNDARY_NAME]: function ({
    children,
  }: {
    children: ReactNode
  }) {
    return children
  },
}

export const MetadataBoundary =
  // We use slice(0) to trick the bundler into not inlining/minifying the function
  // so it retains the name inferred from the namespace object
  NameSpace[METADATA_BOUNDARY_NAME.slice(0) as typeof METADATA_BOUNDARY_NAME]

export const ViewportBoundary =
  // We use slice(0) to trick the bundler into not inlining/minifying the function
  // so it retains the name inferred from the namespace object
  NameSpace[VIEWPORT_BOUNDARY_NAME.slice(0) as typeof VIEWPORT_BOUNDARY_NAME]

export const OutletBoundary =
  // We use slice(0) to trick the bundler into not inlining/minifying the function
  // so it retains the name inferred from the namespace object
  NameSpace[OUTLET_BOUNDARY_NAME.slice(0) as typeof OUTLET_BOUNDARY_NAME]

export const RootLayoutBoundary =
  // We use slice(0) to trick the bundler into not inlining/minifying the function
  // so it retains the name inferred from the namespace object
  NameSpace[
    ROOT_LAYOUT_BOUNDARY_NAME.slice(0) as typeof ROOT_LAYOUT_BOUNDARY_NAME
  ]
