'use client'

export function PreloadCss({ moduleIds }: { moduleIds: string[] | undefined }) {
  // Early return in client compilation and only load requestStore on server side
  if (typeof window !== 'undefined') {
    return null
  }
  const {
    getExpectedRequestStore,
  } = require('../../../client/components/request-async-storage.external')
  const requestStore = getExpectedRequestStore()

  const allFiles = []

  // Search the current dynamic call unique key id in react loadable manifest,
  // and find the corresponding CSS files to preload
  if (requestStore.reactLoadableManifest && moduleIds) {
    const manifest = requestStore.reactLoadableManifest
    for (const key of moduleIds) {
      if (!manifest[key]) continue
      const cssFiles = manifest[key].files.filter((file: string) =>
        file.endsWith('.css')
      )
      allFiles.push(...cssFiles)
    }
  }

  if (allFiles.length === 0) {
    return null
  }

  return (
    <>
      {allFiles.map((file) => {
        return (
          <link
            key={file}
            // @ts-ignore
            precedence={'dynamic'}
            rel="stylesheet"
            href={`${requestStore.assetPrefix}/_next/${encodeURI(file)}`}
            as="style"
          />
        )
      })}
    </>
  )
}
