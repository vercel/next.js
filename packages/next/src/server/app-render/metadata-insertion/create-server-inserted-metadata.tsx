import React from 'react'
import { renderToReadableStream } from 'react-dom/server.edge'
import {
  ServerInsertedMetadataContext,
  type MetadataResolver,
} from '../../../shared/lib/server-inserted-metadata.shared-runtime'
import { renderToString } from '../render-to-string'

/**
 * For chromium based browsers (Chrome, Edge, etc.) and Safari,
 * icons need to stay under <head> to be picked up by the browser.
 *
 */
const REINSERT_ICON_SCRIPT = `\
document.querySelectorAll('body link[rel="icon"], body link[rel="apple-touch-icon"]').forEach(el => document.head.appendChild(el.cloneNode()))`

export function createServerInsertedMetadata(nonce: string | undefined) {
  let metadataResolver: MetadataResolver | null = null
  let metadataToFlush: React.ReactNode = null
  const setMetadataResolver = (resolver: MetadataResolver): void => {
    metadataResolver = resolver
  }

  return {
    ServerInsertedMetadataProvider: ({
      children,
    }: {
      children: React.ReactNode
    }) => {
      return (
        <ServerInsertedMetadataContext.Provider value={setMetadataResolver}>
          {children}
        </ServerInsertedMetadataContext.Provider>
      )
    },

    async getServerInsertedMetadata(): Promise<string> {
      if (!metadataResolver || metadataToFlush) {
        return ''
      }

      metadataToFlush = metadataResolver()
      const html = await renderToString({
        renderToReadableStream,
        element: (
          <>
            {metadataToFlush}
            <script
              defer
              nonce={nonce}
              dangerouslySetInnerHTML={{
                __html: REINSERT_ICON_SCRIPT,
              }}
            />
          </>
        ),
      })

      return html
    },
  }
}
