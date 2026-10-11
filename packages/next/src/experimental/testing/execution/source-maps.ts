import { readFileSync, realpathSync } from 'fs'
import { isAbsolute, relative, resolve, sep } from 'path'
import { fileURLToPath } from 'url'
import type { ModernSourceMapPayload } from '../../../server/lib/source-maps'
import type { CompiledTestArtifact } from '../contracts'

function contains(root: string, file: string): boolean {
  const path = relative(root, file)
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)
}

/**
 * Like the dev validation worker's disk lookup, maps emitted chunks using their
 * adjacent source maps. Restrict reads to this immutable artifact's declared
 * closure. The cache belongs to one worker and dies before its artifact lease.
 */
export function createArtifactSourceMapLookup(
  artifact: Pick<CompiledTestArtifact, 'rootDir' | 'files'>
): (sourceURL: string) => ModernSourceMapPayload | undefined {
  const root = resolve(artifact.rootDir)
  const canonicalRoot = realpathSync(root)
  const files = new Set(artifact.files)
  const maps = new Map<string, string>()
  for (const file of files) {
    if (!file.endsWith('.map') || isAbsolute(file)) continue
    const chunk = file.slice(0, -4)
    const mapPath = resolve(root, file)
    if (!files.has(chunk) || !contains(root, mapPath)) continue
    maps.set(resolve(root, chunk), mapPath)
    maps.set(resolve(canonicalRoot, chunk), mapPath)
  }
  const cache = new Map<string, ModernSourceMapPayload | undefined>()
  return (sourceURL) => {
    let chunk = sourceURL
    if (chunk.startsWith('file://')) {
      try {
        chunk = fileURLToPath(chunk)
      } catch {
        return undefined
      }
    }
    if (!isAbsolute(chunk)) return undefined
    const mapPath = maps.get(resolve(chunk))
    if (!mapPath) return undefined
    if (cache.has(mapPath)) return cache.get(mapPath)
    let payload: ModernSourceMapPayload | undefined
    try {
      // A symlink in a malformed closure must not redirect a read outside it.
      const canonicalMap = realpathSync(mapPath)
      if (contains(canonicalRoot, canonicalMap)) {
        const parsed = JSON.parse(readFileSync(canonicalMap, 'utf8'))
        if (
          parsed?.version === 3 &&
          (typeof parsed.mappings === 'string' ||
            Array.isArray(parsed.sections))
        ) {
          payload = parsed
        }
      }
    } catch {
      // Missing/malformed maps leave a generated frame, not guessed attribution.
    }
    cache.set(mapPath, payload)
    return payload
  }
}
