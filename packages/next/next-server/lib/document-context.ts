import React from 'react'
import { DocumentProps } from './utils'

type DocumentContext = {
  readonly _documentProps: DocumentProps
  readonly _devOnlyInvalidateCacheQueryString: string
}

export const DocumentContext = React.createContext<DocumentContext>(null as any)

if (process.env.NODE_ENV !== 'production') {
  DocumentContext.displayName = 'DocumentContext'
}
