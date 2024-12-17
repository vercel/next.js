'use client'

import { use } from 'react'
import { useServerInsertedHTML } from '../../client/components/navigation'

function ServerInsertHtml({ promise }: { promise: Promise<any> }) {
  let metadataNode: React.ReactNode = null
  let returned = false
  promise.then((resolvedMetadata) => {
    metadataNode = resolvedMetadata
  })
  
  useServerInsertedHTML(() => {
    if (metadataNode && !returned) {
      return metadataNode
    }
  })
  
  returned = true
  return null
}

function BrowserInlineMetadata({ promise }: { promise: Promise<any> }) {
  return use(promise)
}

export function MetadataClientReceiver({ promise }: { promise: Promise<any> }) {
  return (
    <>
      {typeof window === 'undefined' 
        ? <ServerInsertHtml promise={promise} />
        : <BrowserInlineMetadata promise={promise} />
      }
    </>
  )
}