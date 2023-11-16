import type { BuildManifest } from '../get-page-files'

import ReactDOM from 'react-dom'

export function getRequiredScripts(
  buildManifest: BuildManifest,
  assetPrefix: string,
  crossOrigin: undefined | '' | 'anonymous' | 'use-credentials',
  SRIManifest: undefined | Record<string, string>,
  qs: string,
  nonce: string | undefined
): [
  () => void,
  { src: string; integrity?: string; crossOrigin?: string | undefined }
] {
  let preinitScripts: () => void
  let preinitScriptCommands: string[] = []
  const bootstrapScript: {
    src: string
    integrity?: string
    crossOrigin?: string | undefined
  } = {
    src: '',
    crossOrigin,
  }

  const files = buildManifest.rootMainFiles
  if (files.length === 0) {
    throw new Error(
      'Invariant: missing bootstrap script. This is a bug in Next.js'
    )
  }
  if (SRIManifest) {
    bootstrapScript.src = `${assetPrefix}/_next/` + files[0] + qs
    bootstrapScript.integrity = SRIManifest[files[0]]

    for (let i = 1; i < files.length; i++) {
      const src = `${assetPrefix}/_next/` + files[i] + qs
      const integrity = SRIManifest[files[i]]
      preinitScriptCommands.push(src, integrity)
    }
    preinitScripts = () => {
      // preinitScriptCommands is a double indexed array of src/integrity pairs
      for (let i = 0; i < preinitScriptCommands.length; i += 2) {
        ReactDOM.preinit(preinitScriptCommands[i], {
          as: 'script',
          integrity: preinitScriptCommands[i + 1],
          crossOrigin,
          nonce,
        })
      }
    }
  } else {
    bootstrapScript.src = `${assetPrefix}/_next/` + files[0] + qs

    for (let i = 1; i < files.length; i++) {
      const src = `${assetPrefix}/_next/` + files[i] + qs
      preinitScriptCommands.push(src)
    }
    preinitScripts = () => {
      // preinitScriptCommands is a singled indexed array of src values
      for (let i = 0; i < preinitScriptCommands.length; i++) {
        ReactDOM.preinit(preinitScriptCommands[i], {
          as: 'script',
          nonce,
          crossOrigin,
        })
      }
    }
  }

  return [preinitScripts, bootstrapScript]
}
