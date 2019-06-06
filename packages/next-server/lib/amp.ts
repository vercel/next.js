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

/**
 * @deprecated This is no longer required, use export const config = { amp: true }
 */
export function withAmp(Component: any, { hybrid = false } = {}): any {
  return (props: any) => React.createElement(Component, props)
}
