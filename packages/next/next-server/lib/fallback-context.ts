import * as React from 'react'

export const FallbackContext = React.createContext<boolean>(
  // This default is only used when a component does not have a matching
  // Provider above it in the tree (e.g. test environment).
  //
  // We default to `true` because that would be the default rendered state
  // in a non-browser scenario (SSR). Tests of components post-fallback should
  // be using in-browser tests.
  true
)
