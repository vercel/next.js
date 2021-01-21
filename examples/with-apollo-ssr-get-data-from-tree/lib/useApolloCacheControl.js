import { useContext } from 'react'
import { ApolloCacheControl } from './ApolloCacheControl'

export const useApolloCacheControl = () => {
  const context = useContext(ApolloCacheControl.getContext())
  if (context === null) {
    throw new Error('Cannot use useApolloCacheControl without context provider')
  }

  return context
}
