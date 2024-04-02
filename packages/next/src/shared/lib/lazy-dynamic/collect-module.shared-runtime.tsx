'use client'

import { useContext, createContext } from 'react'
import ReactDOM from 'react-dom'

type CaptureFn = (moduleName: string) => void
type ContextValue = {
  // capture: CaptureFn
  manifest: any
}

export const LoadableContext = createContext<ContextValue | null>(null)

if (process.env.NODE_ENV !== 'production') {
  LoadableContext.displayName = 'LoadableContext'
}

export function PreloadModule() {
  // For dev-only
  const context = useContext(LoadableContext)
  const allFiles = []
  if (context && context.manifest) {
    const manifest = context.manifest
    for (const key in manifest) {
      const cssFiles = manifest[key].files.filter((file: string) =>
        file.endsWith('.css')
      )
      allFiles.push(...cssFiles)
    }
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
