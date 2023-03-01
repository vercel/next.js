'use client'

import React from 'react'

type CaptureFn = (moduleName: string) => void

export const LoadableContext = React.createContext<CaptureFn | null>(null)

if (process.env.NODE_ENV !== 'production') {
  LoadableContext.displayName = 'LoadableContext'
}
