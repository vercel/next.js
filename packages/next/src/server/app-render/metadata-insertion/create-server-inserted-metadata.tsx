import React, { type JSX } from 'react'
import { renderToReadableStream } from 'react-dom/server.edge'
import {
  ServerInsertedMetadataContext,
  type MetadataResolver,
} from '../../../shared/lib/server-inserted-metadata.shared-runtime'
import { renderToString } from '../render-to-string'

export function createServerInsertedMetadata() {
  let metadataResolver: MetadataResolver | null = null
  let metadataToFlush: JSX.Element | null = null
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
        element: <>{metadataToFlush}</>,
      })

      return html
    },
  }
}
