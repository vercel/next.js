import React from 'react'
import { AmpStateContext } from './amp-context'

export function isInAmpMode({
  ampFirst = false,
  hybrid = false,
  hasQuery = false,
} = {}) {
  return ampFirst || (hybrid && hasQuery)
}

export function useAmp() {
  const ampState = React.useContext(AmpStateContext)
  // un-comment below to not be considered AMP in dirty mode
  return isInAmpMode(ampState) // && ampMode.hasQuery
}
