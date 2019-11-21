import * as React from 'react'

type CaptureFn = (moduleName: string) => void

// @ts-ignore for some reason the React types don't like this, but it's correct.
export const LoadableContext: React.Context<CaptureFn | null> = React.createContext(
  null
)
