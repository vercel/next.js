'use client'

// This facade ensures that the boundary code is DCE'd in browser bundles.
//
// It also exists to satisfy `browser-chunks.test.ts`, which looks for
// references to code in `packages/next/src/server` in browser bundles and errors if it finds any.
// A "use client" module seems to always have always have an entry in the browser bundle,
// so this module cannot be colocated with the rest of the instant validation code,
// because it ends up looking like it's importing server code in the browser
// even though all the server code inside is actually DCE'd.

const {
  InstantValidationBoundaryContext,
  PlaceValidationBoundaryBelowThisLevel,
  RenderValidationBoundaryAtThisLevel,
} =
  typeof window === 'undefined' && process.env.__NEXT_CACHE_COMPONENTS
    ? (require('../../../server/app-render/instant-validation/boundary-impl') as typeof import('../../../server/app-render/instant-validation/boundary-impl'))
    : ({} as typeof import('../../../server/app-render/instant-validation/boundary-impl'))

export {
  InstantValidationBoundaryContext,
  PlaceValidationBoundaryBelowThisLevel,
  RenderValidationBoundaryAtThisLevel,
}
