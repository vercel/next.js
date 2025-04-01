import React from 'react'
import { renderToReadableStream } from 'react-dom/server.edge'
import {
  ServerInsertedMetadataContext,
  type PendingMetadataNodes,
} from '../../../shared/lib/server-inserted-metadata.shared-runtime'
import { renderToString } from '../render-to-string'

/**
 * For chromium based browsers (Chrome, Edge, etc.) and Safari,
 * icons need to stay under <head> to be picked up by the browser.
 *
 */
const REINSERT_ICON_SCRIPT = `\
document.querySelectorAll('body link[rel="icon"], body link[rel="apple-touch-icon"]').forEach(el => document.head.appendChild(el))`

export function createServerInsertedMetadata(nonce: string | undefined) {
  let metadata: React.ReactNode | null = null

  const setPendingMetadata = (
    pendingMetadataNodes: PendingMetadataNodes
  ): void => {
    pendingMetadataNodes.then(
      (resolvedMetadataNodes) => (metadata = resolvedMetadataNodes),
      (_) => {
        // It's not clear if we really ought to swallow errors here.
        // The way we pending metadata result works errors are carried
        // through the resolve path so it might not be possible for this
        // promise to ever actually reject. Probably worth refactoring at some
        // point.
      }
    )
  }

  return {
    ServerInsertedMetadataProvider: ({
      children,
    }: {
      children: React.ReactNode
    }) => {
      return (
        <ServerInsertedMetadataContext.Provider value={setPendingMetadata}>
          {children}
        </ServerInsertedMetadataContext.Provider>
      )
    },

    async getServerInsertedMetadata(): Promise<string> {
      if (metadata === null) {
        return ''
      }

      const metadataToFlush = metadata
      metadata = null

      const html = await renderToString({
        renderToReadableStream,
        element: (
          <>
            {metadataToFlush}
            <script nonce={nonce}>{REINSERT_ICON_SCRIPT}</script>
          </>
        ),
      })

      return html
    },
  }
}
