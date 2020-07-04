import { DocumentContext } from 'next/document'
import { Store } from 'redux'

/**
 * NextDocumentContext with redux store context
 * @tree
 */
export type AppContext = DocumentContext & {
  readonly store: Store
}
