import * as React from 'react'
import { DocumentProps } from './utils'

type DocumentContext = {
  readonly _documentProps: DocumentProps
  readonly _devOnlyInvalidateCacheQueryString: string
}

export const DocumentContext = React.createContext<DocumentContext>(null as any)
