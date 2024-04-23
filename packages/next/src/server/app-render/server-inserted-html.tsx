// Provider for the `useServerInsertedHTML` API to register callbacks to insert
// elements into the HTML stream.

import React from 'react'
import { ServerInsertedHTMLContext } from '../../shared/lib/server-inserted-html.shared-runtime'

export function createServerInsertedHTML() {
  const serverInsertedHTMLCallbacks: (() => React.ReactNode)[] = []
  const addInsertedHtml = (handler: () => React.ReactNode) => {
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
        <React.Fragment key={'__next_server_inserted__' + index}>
          {callback()}
        </React.Fragment>
      ))
    },
  }
}
