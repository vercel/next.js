import { join } from 'path'
import {
  CLIENT_REFERENCE_MANIFEST,
  SERVER_DIRECTORY,
} from '../shared/lib/constants'

export type RscManifestEntry = {
  clientModules?: Record<
    string,
    { chunks?: Array<string | [string, string[], number[]]> }
  >
  entryJSFiles?: Record<string, string[]>
}

// The manifest file is a JavaScript file that sets a global variable
// (__RSC_MANIFEST). We require() it with a save/restore of the global
export function readRscManifest(
  distDir: string,
  page: string
): Record<string, RscManifestEntry> | undefined {
  const manifestFile = join(
    distDir,
    SERVER_DIRECTORY,
    'app',
    `${page}_${CLIENT_REFERENCE_MANIFEST}.js`
  )
  const g = global as Record<string, unknown>
  const prev = g.__RSC_MANIFEST
  try {
    g.__RSC_MANIFEST = undefined
    require(manifestFile)
    return g.__RSC_MANIFEST as Record<string, RscManifestEntry> | undefined
  } catch {
    return undefined
  } finally {
    g.__RSC_MANIFEST = prev
  }
}
