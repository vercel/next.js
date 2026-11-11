import { readFileSync, realpathSync } from 'fs'
import { isAbsolute, relative, resolve, sep } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createHash } from 'node:crypto'
import {
  SourceMapConsumer,
  type RawSourceMap,
} from 'next/dist/compiled/source-map'
import type { ModernSourceMapPayload } from '../../../server/lib/source-maps'
import type { CompiledTestArtifact } from '../contracts'

export interface ArtifactOriginalSource {
  file: string
  content: string
  sha256: string
  ignored: boolean
}

export type ArtifactSourceMapLookup = ((
  sourceURL: string
) => ModernSourceMapPayload | undefined) & {
  originalSource?(sourceURL: string): ArtifactOriginalSource | undefined
}

function contains(root: string, file: string): boolean {
  const path = relative(root, file)
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)
}

function originalFilename(sourceURL: string): string | undefined {
  try {
    const file = sourceURL.startsWith('file:')
      ? fileURLToPath(sourceURL)
      : sourceURL
    return isAbsolute(file) ? resolve(file) : undefined
  } catch {
    return undefined
  }
}

/**
 * Like the dev validation worker's disk lookup, maps emitted chunks using their
 * adjacent source maps. Restrict reads to this immutable artifact's declared
 * closure. The cache belongs to one worker and dies before its artifact lease.
 */
export function createArtifactSourceMapLookup(
  artifact: Pick<CompiledTestArtifact, 'rootDir' | 'files' | 'sourceHash'>,
  entryFile?: string,
  hostSourceMap?: {
    /** Actual executing module supplied by Node's findSourceMap(__filename). */
    compiledFile: string
    payload: ModernSourceMapPayload
  }
): ArtifactSourceMapLookup {
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
  const mapURLs = new Map<string, string>()
  const readPayload = (mapPath: string) => {
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
          mapURLs.set(mapPath, pathToFileURL(canonicalMap).href)
        }
      }
    } catch {
      // Missing/malformed maps leave a generated frame, not guessed attribution.
    }
    cache.set(mapPath, payload)
    return payload
  }
  const lookup = (sourceURL: string) => {
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
    return mapPath ? readPayload(mapPath) : undefined
  }
  // Only the qualified isolated Node worker supplies an entry. Other roles
  // retain the existing generated-frame lookup without authored attribution.
  if (entryFile === undefined) return lookup
  let originals: Map<string, ArtifactOriginalSource | undefined> | undefined
  const selected = resolve(entryFile)
  return Object.assign(lookup, {
    originalSource(sourceURL: string): ArtifactOriginalSource | undefined {
      const requestedFile = originalFilename(sourceURL)
      if (!requestedFile) return
      if (originals === undefined) {
        originals = new Map()
        const record = (
          records: Map<string, ArtifactOriginalSource | undefined>,
          file: string,
          source: ArtifactOriginalSource | undefined
        ) => {
          if (!records.has(file)) {
            records.set(file, source)
            return
          }
          const previous = records.get(file)
          if (
            !previous ||
            !source ||
            previous.content !== source.content ||
            previous.ignored !== source.ignored
          )
            records.set(file, undefined)
        }
        const visit = (
          payload: ModernSourceMapPayload,
          mapURL: string,
          records: Map<string, ArtifactOriginalSource | undefined>,
          explicitIgnoreListOnly = false
        ): boolean => {
          if ('sections' in payload) {
            // Validate the actual indexed map before accepting any of its sources.
            new SourceMapConsumer(payload as unknown as RawSourceMap)
            return payload.sections.every((section) =>
              visit(section.map, mapURL, records, explicitIgnoreListOnly)
            )
          }
          if (
            !Array.isArray(payload.sources) ||
            payload.sources.some((source) => typeof source !== 'string') ||
            (payload.sourceRoot !== undefined &&
              typeof payload.sourceRoot !== 'string')
          )
            return false
          const consumer = new SourceMapConsumer(
            payload as unknown as RawSourceMap,
            // @ts-expect-error: the bundled consumer supports the source map URL.
            mapURL
          )
          consumer.eachMapping(() => {})
          const sources = (
            consumer as SourceMapConsumer & { sources: string[] }
          ).sources
          const contents = (
            payload as typeof payload & { sourcesContent?: unknown[] }
          ).sourcesContent
          if (
            (contents !== undefined && !Array.isArray(contents)) ||
            (payload.ignoreList !== undefined &&
              (!Array.isArray(payload.ignoreList) ||
                payload.ignoreList.some(
                  (index) =>
                    !Number.isSafeInteger(index) ||
                    index < 0 ||
                    index >= sources.length
                )))
          )
            return false
          for (let index = 0; index < sources.length; index++) {
            const original = originalFilename(sources[index])
            if (!original) continue
            const content = contents?.[index]
            if (typeof content !== 'string') {
              record(records, original, undefined)
              continue
            }
            const sha256 = createHash('sha256').update(content).digest('hex')
            if (original === selected && sha256 !== artifact.sourceHash) {
              record(records, original, undefined)
              continue
            }
            record(records, original, {
              file: original,
              content,
              sha256,
              ignored:
                (!explicitIgnoreListOnly &&
                  original.includes('node_modules')) ||
                payload.ignoreList?.includes(index) === true,
            })
          }
          return true
        }
        for (const mapPath of new Set(maps.values())) {
          const payload = readPayload(mapPath)
          const mapURL = mapURLs.get(mapPath)
          if (!payload || !mapURL) continue
          try {
            const records = new Map<
              string,
              ArtifactOriginalSource | undefined
            >()
            if (visit(payload, mapURL, records))
              for (const [file, source] of records)
                record(originals, file, source)
          } catch {
            // Invalid maps do not provide an original-source identity.
          }
        }
        if (hostSourceMap) {
          try {
            const records = new Map<
              string,
              ArtifactOriginalSource | undefined
            >()
            if (
              visit(
                hostSourceMap.payload,
                pathToFileURL(`${hostSourceMap.compiledFile}.map`).href,
                records,
                true
              )
            )
              // The host map must itself supply the existing ignore fact.
              for (const [file, source] of records)
                if (source?.ignored) record(originals, file, source)
          } catch {
            // An absent or invalid host map cannot invent an ignored source.
          }
        }
        if (selected !== undefined) {
          const entry = originals.get(selected)
          if (!entry || entry.sha256 !== artifact.sourceHash) originals.clear()
        }
      }
      return originals.get(requestedFile)
    },
  })
}
