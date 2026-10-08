/* eslint-disable @next/internal/no-ambiguous-jsx -- whole module is used in React Client */
// Provider for the `useServerInsertedHTML` API to register callbacks to insert
// elements into the HTML stream.

import type { JSX, ReactNode } from 'react'
import * as ReactClient from 'react'
import { ServerInsertedHTMLContext } from '../../shared/lib/server-inserted-html.shared-runtime'

// Whether a node is known to render no HTML, e.g. what CSS-in-JS registries
// return when there's nothing new to flush (`null`, `<>{[]}</>`). This is
// intentionally conservative: components are never called, iterables other
// than arrays are never consumed, and `0` is not empty since it renders text.
function isEmptyNode(node: ReactNode): boolean {
  if (
    node === null ||
    node === undefined ||
    node === '' ||
    typeof node === 'boolean'
  ) {
    return true
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (!isEmptyNode(node[i])) {
        return false
      }
    }
    return true
  }
  if (ReactClient.isValidElement(node) && node.type === ReactClient.Fragment) {
    return isEmptyNode((node.props as { children?: ReactNode }).children)
  }
  return false
}

export function createServerInsertedHTML() {
  const serverInsertedHTMLCallbacks: (() => ReactNode)[] = []
  const addInsertedHtml = (handler: () => ReactNode) => {
    serverInsertedHTMLCallbacks.push(handler)
  }

  return {
    ServerInsertedHTMLProvider({ children }: { children: JSX.Element }) {
      return (
        <ServerInsertedHTMLContext.Provider value={addInsertedHtml}>
          {children}
        </ServerInsertedHTMLContext.Provider>
      )
    },
    renderServerInsertedHTML() {
      // Call every callback on each flush, since registries flush their pending
      // styles when called, but leave out empty results so that
      // `getServerInsertedHTML` can skip rendering when there's nothing new.
      const elements: JSX.Element[] = []
      const length = serverInsertedHTMLCallbacks.length
      for (let i = 0; i < length; i++) {
        const callback = serverInsertedHTMLCallbacks[i]
        const node = callback()
        if (!isEmptyNode(node)) {
          elements.push(
            <ReactClient.Fragment key={'__next_server_inserted__' + i}>
              {node}
            </ReactClient.Fragment>
          )
        }
      }
      return elements
    },
  }
}
