import React from 'react'
import { AmpStateContext } from './amp-context'
import { isInAmpMode } from './amp-mode'

export function useAmp(): boolean {
  // Don't assign the context value to a variable to save bytes
  return isInAmpMode(React.useContext(AmpStateContext))
}
