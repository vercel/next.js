import * as React from 'react'

type CaptureFn = (moduleName: string) => void

export const LoadableContext = React.createContext<CaptureFn | null>(null)
