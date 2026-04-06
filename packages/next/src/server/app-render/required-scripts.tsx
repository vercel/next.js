import { encodeURIPath } from '../../shared/lib/encode-uri-path'
import type { BuildManifest } from '../get-page-files'

import ReactDOM from 'react-dom'

/**
 * Returns the preinit scripts callback and the fizzOptions bootstrap entry for
 * the page's required scripts.
 *
 * When `isEsmChunks` is true (turbopackBrowserEsmChunks), all chunks are ES
 * modules so the bootstrap file must be loaded as `<script type="module">`.
 * React accepts this via `bootstrapModules` (vs `bootstrapScripts` for classic
 * scripts). The preload hints for extra files also use `<link rel="modulepreload">`
 * instead of `<link rel="preload" as="script">`.
 */
export function getRequiredScripts(
  buildManifest: BuildManifest,
  assetPrefix: string,
  crossOrigin: undefined | '' | 'anonymous' | 'use-credentials',
  SRIManifest: undefined | Record<string, string>,
  qs: string,
  nonce: string | undefined,
  pagePath: string,
  isEsmChunks: boolean = false
): [
  () => void,
  (
    | {
        bootstrapScripts: [
          { src: string; integrity?: string; crossOrigin?: string | undefined },
        ]
      }
    | {
        bootstrapModules: [
          { src: string; integrity?: string; crossOrigin?: string | undefined },
        ]
      }
  ),
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

  const files = (
    buildManifest.rootMainFilesTree?.[pagePath] || buildManifest.rootMainFiles
  ).map(encodeURIPath)
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
    if (isEsmChunks) {
      preinitScripts = () => {
        // preinitScriptCommands is a double indexed array of src/integrity pairs
        for (let i = 0; i < preinitScriptCommands.length; i += 2) {
          ReactDOM.preinitModule(preinitScriptCommands[i], {
            as: 'script',
            integrity: preinitScriptCommands[i + 1],
            crossOrigin,
            nonce,
          })
        }
      }
    } else {
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
    }
  } else {
    bootstrapScript.src = `${assetPrefix}/_next/` + files[0] + qs

    for (let i = 1; i < files.length; i++) {
      const src = `${assetPrefix}/_next/` + files[i] + qs
      preinitScriptCommands.push(src)
    }
    if (isEsmChunks) {
      preinitScripts = () => {
        // preinitScriptCommands is a singled indexed array of src values
        for (let i = 0; i < preinitScriptCommands.length; i++) {
          ReactDOM.preinitModule(preinitScriptCommands[i], {
            as: 'script',
            nonce,
            crossOrigin,
          })
        }
      }
    } else {
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
  }

  if (isEsmChunks) {
    return [preinitScripts, { bootstrapModules: [bootstrapScript] }]
  }
  return [preinitScripts, { bootstrapScripts: [bootstrapScript] }]
}
