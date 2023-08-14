import type { BuildManifest } from '../get-page-files'

import ReactDOM from 'react-dom'

export function getRequiredScripts(
  buildManifest: BuildManifest,
  assetPrefix: string,
  SRIManifest: undefined | Record<string, string>,
  qs: string
): [() => void, string | { src: string; integrity: string }] {
  let preinitScripts: () => void
  let preinitScriptCommands: string[] = []
  let bootstrapScript: string | { src: string; integrity: string } = ''
  const files = buildManifest.rootMainFiles
  if (files.length === 0) {
    throw new Error(
      'Invariant: missing bootstrap script. This is a bug in Next.js'
    )
  }
  if (SRIManifest) {
    bootstrapScript = {
      src: `${assetPrefix}/_next/` + files[0] + qs,
      integrity: SRIManifest[files[0]],
    }
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
        })
      }
    }
  } else {
    bootstrapScript = `${assetPrefix}/_next/` + files[0] + qs
    for (let i = 1; i < files.length; i++) {
      const src = `${assetPrefix}/_next/` + files[i] + qs
      preinitScriptCommands.push(src)
    }
    preinitScripts = () => {
      // preinitScriptCommands is a singled indexed array of src values
      for (let i = 0; i < preinitScriptCommands.length; i++) {
        ReactDOM.preinit(preinitScriptCommands[i], {
          as: 'script',
        })
      }
    }
  }

  return [preinitScripts, bootstrapScript]
}
