import React from 'react'
import {IsAmpContext} from './amphtml-context'

export function useAmp() {
  return React.useContext(IsAmpContext)
}
