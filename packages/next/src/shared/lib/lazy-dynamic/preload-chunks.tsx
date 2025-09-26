'use client'

import { preload } from 'react-dom'

import { workAsyncStorage } from '../../../server/app-render/work-async-storage.external'
import { encodeURIPath } from '../encode-uri-path'

export function PreloadChunks({
  moduleIds,
}: {
  moduleIds: string[] | undefined
}) {
  // Early return in client compilation and only load requestStore on server side
  if (typeof window !== 'undefined') {
    return null
  }

  const workStore = workAsyncStorage.getStore()
  if (workStore === undefined) {
    return null
  }

  const allFiles = []

  // Search the current dynamic call unique key id in react loadable manifest,
  // and find the corresponding CSS files to preload
  if (workStore.reactLoadableManifest && moduleIds) {
    const manifest = workStore.reactLoadableManifest
    for (const key of moduleIds) {
      if (!manifest[key]) continue
      const chunks = manifest[key].files
      allFiles.push(...chunks)
    }
  }

  if (allFiles.length === 0) {
    return null
  }

  const dplId = process.env.NEXT_DEPLOYMENT_ID
    ? `?dpl=${process.env.NEXT_DEPLOYMENT_ID}`
    : ''

  return (
    <>
      {allFiles.map((chunk) => {
        const href = `${workStore.assetPrefix}/_next/${encodeURIPath(chunk)}${dplId}`
        const isCss = chunk.endsWith('.css')
        // If it's stylesheet we use `precedence` o help hoist with React Float.
        // For stylesheets we actually need to render the CSS because nothing else is going to do it so it needs to be part of the component tree.
        // The `preload` for stylesheet is not optional.
        if (isCss) {
          return (
            <link
              key={chunk}
              // @ts-ignore
              precedence="dynamic"
              href={href}
              rel="stylesheet"
              as="style"
              nonce={workStore.nonce}
            />
          )
        } else {
          // If it's script we use ReactDOM.preload to preload the resources
          preload(href, {
            as: 'script',
            fetchPriority: 'low',
            nonce: workStore.nonce,
          })
          return null
        }
      })}
    </>
  )
}
