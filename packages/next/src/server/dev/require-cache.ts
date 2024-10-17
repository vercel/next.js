import isError from '../../lib/is-error'
import { realpathSync } from '../../lib/realpath'
import { clearManifestCache } from '../load-manifest'

function deleteFromRequireCache(filePath: string) {
  try {
    filePath = realpathSync(filePath)
  } catch (e) {
    if (isError(e) && e.code !== 'ENOENT') throw e
  }
  const mod = require.cache[filePath]
  if (mod) {
    // remove the child reference from all parent modules
    for (const parent of Object.values(require.cache)) {
      if (parent?.children) {
        const idx = parent.children.indexOf(mod)
        if (idx >= 0) parent.children.splice(idx, 1)
      }
    }
    // remove parent references from external modules
    for (const child of mod.children) {
      child.parent = null
    }
    delete require.cache[filePath]
    return true
  }
  return false
}

export function deleteAppClientCache() {
  deleteFromRequireCache(
    require.resolve('next/dist/compiled/next-server/app-page.runtime.dev.js')
  )
  deleteFromRequireCache(
    require.resolve(
      'next/dist/compiled/next-server/app-page-experimental.runtime.dev.js'
    )
  )
}

export function deleteCache(filePath: string) {
  // try to clear it from the fs cache
  clearManifestCache(filePath)

  deleteFromRequireCache(filePath)
}
