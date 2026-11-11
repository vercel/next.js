import { createHash } from 'crypto'
import { isAbsolute, relative, resolve, sep } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import type { IstanbulHarnessCoverage } from './types'

function fail(): never {
  throw new Error('Invalid native Istanbul harness coverage.')
}
const exact = (
  value: unknown,
  names: readonly string[]
): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === names.length &&
  names.every((name) => Object.hasOwn(value, name))
const digest = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
function sourceFile(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.includes('\0')) return
  try {
    const file = fileURLToPath(value)
    if (
      isAbsolute(file) &&
      resolve(file) === file &&
      pathToFileURL(file).href === value
    )
      return file
  } catch {
    // Invalid file URLs are not native source identities.
  }
}

/** Separate from mock records; presence never changes an ordinary V8 request. */
export function validateIstanbulHarnessCoverage(
  value: unknown
): asserts value is IstanbulHarnessCoverage {
  if (
    !exact(value, ['version', 'nativeMetadata', 'sources']) ||
    value.version !== 1 ||
    !exact(value.nativeMetadata, ['path', 'sha256']) ||
    typeof value.nativeMetadata.path !== 'string' ||
    !value.nativeMetadata.path ||
    !digest(value.nativeMetadata.sha256) ||
    !Array.isArray(value.sources) ||
    !value.sources.length
  )
    fail()
  const seen = new Set<string>()
  for (const source of value.sources) {
    if (
      !exact(source, ['source', 'sha256']) ||
      !sourceFile(source.source) ||
      typeof source.source !== 'string' ||
      seen.has(source.source) ||
      !digest(source.sha256)
    )
      fail()
    seen.add(source.source)
  }
}

/** Read the actual endpoint output through the caller's existing artifact lease. */
export async function readIstanbulHarnessCoverage(options: {
  entryPath: string
  files: readonly string[]
  projectDir: string
  setupFiles: readonly string[]
  snapshotSerializers: readonly string[]
  signal: AbortSignal
  readArtifact: (path: string) => Promise<Buffer>
}): Promise<IstanbulHarnessCoverage | undefined> {
  options.signal.throwIfAborted()
  const path = options.entryPath.replace(/\.js$/, '.harness-coverage.json')
  if (path === options.entryPath) fail()
  const requested =
    options.setupFiles.length || options.snapshotSerializers.length
  if (!requested) {
    if (options.files.includes(path)) fail()
    return undefined
  }
  if (!options.files.includes(path)) fail()
  const bytes = await options.readArtifact(path)
  options.signal.throwIfAborted()
  const data: unknown = JSON.parse(bytes.toString('utf8'))
  if (
    !exact(data, ['version', 'kind', 'entryPath', 'sources']) ||
    data.version !== 1 ||
    data.kind !== 'node-test-harness' ||
    data.entryPath !== options.entryPath ||
    !Array.isArray(data.sources)
  )
    fail()
  const setups = new Set(
    options.setupFiles.map((file) => {
      if (!isAbsolute(file) || resolve(file) !== file) fail()
      return pathToFileURL(file).href
    })
  )
  const seenSetups = new Set<string>()
  const seenSources = new Set<string>()
  let serializers = false
  const expectedSerializers = options.snapshotSerializers.length > 0
  const sources: { source: string; sha256: string }[] = []
  for (const source of data.sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) fail()
    const record = source as Record<string, unknown>
    const file = sourceFile(record.source)
    if (
      !file ||
      typeof record.source !== 'string' ||
      seenSources.has(record.source) ||
      typeof record.code !== 'string' ||
      !record.code
    )
      fail()
    const fromProject = relative(options.projectDir, file)
    if (
      fromProject === '..' ||
      fromProject.startsWith('..' + sep) ||
      isAbsolute(fromProject)
    )
      fail()
    seenSources.add(record.source)
    if (record.kind === 'setup') {
      if (
        !exact(record, ['kind', 'source', 'code', 'setup']) ||
        typeof record.setup !== 'string' ||
        !setups.has(record.setup) ||
        seenSetups.has(record.setup)
      )
        fail()
      seenSetups.add(record.setup)
    } else if (record.kind === 'snapshot-serializers') {
      if (
        !exact(record, ['kind', 'source', 'code', 'serializers']) ||
        serializers ||
        !options.snapshotSerializers.length ||
        !Array.isArray(record.serializers) ||
        record.serializers.length !== options.snapshotSerializers.length ||
        record.serializers.some(
          (request, index) => request !== options.snapshotSerializers[index]
        )
      )
        fail()
      serializers = true
    } else fail()
    sources.push({
      source: record.source,
      sha256: createHash('sha256').update(record.code).digest('hex'),
    })
  }
  if (seenSetups.size !== setups.size || serializers !== expectedSerializers)
    fail()
  const result = {
    version: 1 as const,
    nativeMetadata: {
      path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
    sources,
  }
  validateIstanbulHarnessCoverage(result)
  return result
}
