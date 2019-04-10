import React from 'react'
import {AmpModeContext} from './amphtml-context'

export function isAmp({
  hybrid= false,
  enabled= false,
  hasQuery= false,
} = {}) {
  return enabled && (!hybrid || (hybrid && hasQuery))
}

export function useAmp() {
  const ampMode = React.useContext(AmpModeContext)
  return isAmp(ampMode)
}

export function withAmp(
  Component: any,
  { hybrid = false } = {},
): any {
  function WithAmpWrapper(props= {}) {
    const ampMode = React.useContext(AmpModeContext)
    ampMode.enabled = true
    ampMode.hybrid = hybrid

    return React.createElement(Component, props)
  }

  WithAmpWrapper.getInitialProps = Component.getInitialProps
  return WithAmpWrapper
}
