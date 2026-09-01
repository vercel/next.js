import { getServerActionsManifest } from './manifests-singleton'
import { normalizeFilePath } from './segment-explorer-path'

type ServerReferenceMetadata = {
  exportedName?: string
  file?: string
}

export function getServerReferenceMetadata(
  referenceId: string,
  projectDir: string | undefined
): ServerReferenceMetadata | null {
  const manifest = getServerActionsManifest()
  const runtime = process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'node'
  const entry = manifest[runtime]?.[referenceId]

  if (!entry) {
    return null
  }

  let file: string | undefined
  if (process.env.__NEXT_DEV_SERVER && entry.filename) {
    file = normalizeFilePath(
      projectDir || (runtime === 'edge' ? '' : process.cwd()),
      entry.filename
    )
  }

  return {
    exportedName: entry.exportedName,
    file,
  }
}
