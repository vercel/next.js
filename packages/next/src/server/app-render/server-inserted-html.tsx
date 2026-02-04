/* eslint-disable @next/internal/no-ambiguous-jsx -- whole module is used in React Client */
// Provider for the `useServerInsertedHTML` API to register callbacks to insert
// elements into the HTML stream.

import type { JSX, ReactNode } from 'react'
import * as ReactClient from 'react'
import { ServerInsertedHTMLContext } from '../../shared/lib/server-inserted-html.shared-runtime'

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
      return serverInsertedHTMLCallbacks.map((callback, index) => (
        <ReactClient.Fragment key={'__next_server_inserted__' + index}>
          {callback()}
        </ReactClient.Fragment>
      ))
    },
  }
}
