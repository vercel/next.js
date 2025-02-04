import React, { type JSX } from 'react'
import { renderToReadableStream } from 'react-dom/server.edge'
import {
  ServerInsertedMetadataContext,
  type MetadataResolver,
} from '../../../shared/lib/server-inserted-metadata.shared-runtime'
import { renderToString } from '../render-to-string'
import type { AppPageRenderResultMetadata } from '../../render-result'
import type { PostponedState } from '../postponed-state'

export function createServerInsertedMetadata(
  metadata: AppPageRenderResultMetadata | undefined
) {
  let metadataResolver: MetadataResolver | null = null
  let metadataToFlush: JSX.Element | null = null
  let id = Math.round(
    Math.random() * Math.pow(10, 10)
  )
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
      if (
        !metadataResolver || 
        metadataToFlush
        
      ) {
        return ''
      }
      
      metadataToFlush = metadataResolver()
      const html = await renderToString({
        renderToReadableStream,
        element: <>{metadataToFlush}</>,
      })
      if (metadata && metadata.postponed) {
        if (metadata.postponed.startsWith('0:')) {
        metadata.postponed = '1' + metadata.postponed.slice(1)
        }
      }
      
      return html
    }
  }
}

export function isMetadataInsertedInShell(postponedState: PostponedState | null) {
  const isMetadataAlreadyInsertedInPrerender = (postponedState && 'data' in postponedState && 
    'metadataInserted' in postponedState.data &&
    postponedState.data.metadataInserted
  )

  return !!isMetadataAlreadyInsertedInPrerender
}