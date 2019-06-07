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
  // un-comment below to not be considered AMP in dirty mode
  return isAmp(React.useContext(AmpModeContext)) // && ampMode.hasQuery
}

export function withAmp(
  Component: React.ComponentType & { getInitialProps?: any },
  { hybrid = false } = {}
): any {
  function WithAmpWrapper(props = {}) {
    const ampMode = React.useContext(AmpModeContext)
    ampMode.enabled = true
    ampMode.hybrid = hybrid

    return <Component {...props} />
  }

  WithAmpWrapper.getInitialProps = Component.getInitialProps
  return WithAmpWrapper
}
