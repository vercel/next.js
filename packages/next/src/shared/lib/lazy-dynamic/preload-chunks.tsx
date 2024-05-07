'use client'

import { getExpectedRequestStore } from '../../../client/components/request-async-storage.external'

export function PreloadChunks({
  moduleIds,
}: {
  moduleIds: string[] | undefined
}) {
  // Early return in client compilation and only load requestStore on server side
  if (typeof window !== 'undefined') {
    return null
  }

  const requestStore = getExpectedRequestStore('next/dynamic preload')
  const allFiles = []

  // Search the current dynamic call unique key id in react loadable manifest,
  // and find the corresponding CSS files to preload
  if (requestStore.reactLoadableManifest && moduleIds) {
    const manifest = requestStore.reactLoadableManifest
    for (const key of moduleIds) {
      if (!manifest[key]) continue
      const chunks = manifest[key].files
      allFiles.push(...chunks)
    }
  }

  if (allFiles.length === 0) {
    return null
  }

  return (
    <>
      {allFiles.map((chunk) => {
        const href = `${requestStore.assetPrefix}/_next/${encodeURI(chunk)}`
        if (chunk.endsWith('.css')) {
          return (
            <link
              key={chunk}
              // @ts-ignore
              precedence={'dynamic'}
              rel="stylesheet"
              href={href}
              as="style"
            />
          )
        } else {
          return (
            <script
              key={chunk}
              // @ts-ignore
              precedence={'dynamic'}
              src={href}
              defer
            />
          )
        }
      })}
    </>
  )
}
