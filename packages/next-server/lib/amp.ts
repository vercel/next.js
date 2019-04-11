import React from 'react'
import {AmpModeContext} from './amphtml-context'

export function isAmp({ enabled= false} = {}) {
  return enabled
}

export function useAmp() {
  const ampMode = React.useContext(AmpModeContext)
  const { hybrid, hasQuery } = ampMode
  // this returns false for dirty AMP
  return isAmp(ampMode) && (!hybrid || (hybrid && hasQuery))
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
