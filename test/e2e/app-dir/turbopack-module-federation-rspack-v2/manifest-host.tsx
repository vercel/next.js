'use client'

import { useEffect, useState } from 'react'

// This component is copied only into the Rspack-v2 Next host fixture. The webpack-v1
// fixture shares its base files, but intentionally has no manifest remotes.
export function ManifestImports() {
  const [fromString, setFromString] = useState('loading')
  const [fromObject, setFromObject] = useState('loading')

  useEffect(() => {
    async function load() {
      // @ts-expect-error -- resolved by the manifest URL in the isolated Next host config
      const first = await import('catalogManifest/message')
      // @ts-expect-error -- resolved by the manifest object in the isolated Next host config
      const second = await import('catalogObject/message')
      setFromString(first.message)
      setFromObject(second.message)
    }
    load().catch((error) => setFromString(`error: ${error.message}`))
  }, [])

  return (
    <>
      <p id="manifest-import-string">{fromString}</p>
      <p id="manifest-import-object">{fromObject}</p>
    </>
  )
}
