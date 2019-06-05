import React from 'react'
import { AmpModeContext } from './amphtml-context'

export function isAmp({
  enabled = false,
  hybrid = false,
  hasQuery = false,
} = {}) {
  return enabled && (!hybrid || (hybrid && hasQuery))
}

export function useAmp() {
  const ampMode = React.useContext(AmpModeContext)
  // un-comment below to not be considered AMP in dirty mode
  return isAmp(ampMode) // && ampMode.hasQuery
}

export function withAmp(Component: any, { hybrid = false } = {}): any {
  function WithAmpWrapper(props = {}) {
    const ampMode = React.useContext(AmpModeContext)
    ampMode.enabled = true
    ampMode.hybrid = hybrid

    return React.createElement(Component, props)
  }

  WithAmpWrapper.__nextAmpOnly = !hybrid
  WithAmpWrapper.getInitialProps = Component.getInitialProps
  return WithAmpWrapper
}
