import React from 'react'
import { DocumentProps } from './utils'

export const DocumentContext = React.createContext<DocumentProps>(null as any)

if (process.env.NODE_ENV !== 'production') {
  DocumentContext.displayName = 'DocumentContext'
}
