'use client'

import ReactDOM from 'react-dom'

export function PreloadModule() {
  // Early return in client compilation and only load requestStore on server side
  if (typeof window !== 'undefined') {
    return null
  }
  const {
    getExpectedRequestStore,
  } = require('../../../client/components/request-async-storage.external')
  const requestStore = getExpectedRequestStore()

  const allFiles = []
  if (requestStore.reactLoadableManifest) {
    const manifest = requestStore.reactLoadableManifest
    for (const key in manifest) {
      const cssFiles = manifest[key].files.filter((file: string) =>
        file.endsWith('.css')
      )
      allFiles.push(...cssFiles)
    }
  }

  if (allFiles.length === 0) {
    return null
  }

  for (const file of allFiles) {
    ReactDOM.preload('/_next/' + file, { as: 'style' })
  }

  return (
    <>
      {allFiles.map((file) => {
        return (
          <link
            key={file}
            rel="preload stylesheet"
            href={'/_next/' + file}
            as="style"
          />
        )
      })}
    </>
  )
}
