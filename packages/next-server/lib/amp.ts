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

/**
 * @deprecated This is no longer required, use export const config = { amp: true }
 */
export function withAmp(Component: any, { hybrid = false } = {}): any {
  function WithAmpWrapper(props = {}) {
    const ampState = React.useContext(AmpStateContext)
    ampState.ampFirst = !hybrid
    ampState.hybrid = hybrid

    return React.createElement(Component, props)
  }

  WithAmpWrapper.__nextAmpOnly = !hybrid
  WithAmpWrapper.getInitialProps = Component.getInitialProps
  return WithAmpWrapper
}
