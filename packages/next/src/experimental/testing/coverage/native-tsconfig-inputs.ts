import { createHash } from 'crypto'
import { constants } from 'fs'
import { lstat, open, realpath, readdir } from 'fs/promises'
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'path'
import { isDeepStrictEqual } from 'util'
import type { CompiledTestArtifact, TestProfile } from '../contracts'
import { coverageHash, within } from './artifact'
import { verifySourceCoverageArtifact } from './source-profile'

export interface NativeTsConfigInputsReference {
  version: 1
  nativeMetadata: { path: string; sha256: string }
}
interface NativePath {
  nativePath: string
  path: string
}
type Consumer = 'typescript' | 'decorators' | 'jsx' | 'aliases'
interface Context {
  consumer: Consumer
  configuredPath: NativePath | null
  consumerPath: NativePath
  lookupPath: NativePath
  request: string
  chainIndex: number
  attemptIndex: number
}
type Identity =
  | { status: 'found'; target: NativePath; symlinks: NativePath[] }
  | { status: 'absent'; symlinks: NativePath[] }
type Probe =
  | { kind: 'selection'; fact: { selected: NativePath | null } }
  | {
      kind: 'fixed-metadata'
      fact: {
        succeeded: boolean
        observed: 'file' | 'absent'
        identity: Identity
      }
    }
  | {
      kind: 'config-read'
      fact: {
        status: 'parsed' | 'empty'
        sha256: string
        observed: 'file'
        identity: Identity
      }
    }
  | {
      kind: 'extends'
      fact: {
        request: string
        primary: {
          request: string | null
          conditions: []
          result: { kind: 'source'; path: NativePath }
        }[]
        affectingSourceReferences: []
      }
    }
  | { kind: 'realpath'; fact: Identity }
  | { kind: 'directory'; fact: { found: boolean } }
  | {
      kind: 'candidate'
      fact: { requested: 'entry' | 'file'; observed: 'file' | 'absent' }
    }
type RecordValue = Probe & {
  context: Context
  order: number[]
  path: NativePath
}
interface Script {
  path: string
  sha256: string
  mapPath: string | null
  mapSha256: string | null
}
export interface NativeTsConfigInputsV1 {
  version: 1
  kind: 'native-typescript-config-inputs'
  mode: 'development' | 'production'
  environment: 'node'
  route: null
  browserClient: false
  sourceCoverage: boolean
  entryId: string
  entryFile: string
  entryPath: string
  revision: string
  filesystemRoot: NativePath
  projectPath: NativePath
  complete: true
  reasons: []
  scripts: Script[]
  records: RecordValue[]
}
export interface NativeTsConfigRequest {
  version: 1
  role: 'compiler-source' | 'runtime'
  id: string
  revision: string
  profile: TestProfile
  source: { id: string; file: string; sha256: string }
  native: {
    entryId: string
    entryFile: string
    entryPath: string
    sourceCoverage: boolean
    filesystemRoot: NativePath
    projectPath: NativePath
  }
}
export interface NativeTsConfigLeaseAuthorization {
  request: NativeTsConfigRequest
  artifactRoot: string
  /** Independent parent issuer: actual opted-in native endpoint plus this live allocation. */
  assertLease(): void
}
export interface ParentNativeTsConfigFact {
  version: 1
  kind: 'next-parent-native-tsconfig-inputs'
  request: NativeTsConfigRequest
  compiler: { entryId: string; revision: string; rootDir: string }
  reference: NativeTsConfigInputsReference
  native: NativeTsConfigInputsV1
}
export interface NativeTsConfigWatchInput {
  path: string
  kind: 'file' | 'absence' | 'directory'
}

// Facts stay in the parent. JSON/IPC and structuredClone cannot recreate issuance.
// A future cache must retain these frozen objects, not clone them through child data.
const issued = new WeakMap<ParentNativeTsConfigFact, NativeTsConfigRequest>()
const consumers = ['typescript', 'decorators', 'jsx', 'aliases'] as const
const ranks = [
  'selection',
  'fixed-metadata',
  'config-read',
  'extends',
  'realpath',
  'directory',
  'candidate',
]
function fail(reason: string): never {
  throw new Error(`Invalid native TypeScript config inputs: ${reason}`)
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function keys(
  value: unknown,
  names: readonly string[]
): asserts value is Record<string, unknown> {
  if (
    !object(value) ||
    Object.keys(value).sort().join(',') !== [...names].sort().join(',')
  )
    fail('exact schema required')
}
function text(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.includes('\0')) fail('invalid string')
}
function hash(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    fail('invalid hash')
}
function opaque(value: unknown): asserts value is string {
  text(value)
  if (!value || Buffer.byteLength(value) > 256)
    fail('invalid parent request/revision')
}
function integer(value: unknown): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 0xffffffff
  )
    fail('invalid native order')
}
function physical(value: unknown): asserts value is string {
  text(value)
  if (!isAbsolute(value) || resolve(value) !== value)
    fail('non-canonical physical path')
}
function pathValue(
  value: unknown,
  root: NativePath
): asserts value is NativePath {
  keys(value, ['nativePath', 'path'])
  text(value.nativePath)
  physical(value.path)
  if (
    value.nativePath.startsWith('/') ||
    value.nativePath.split('/').some((part) => part === '..' || part === '.') ||
    value.nativePath.includes('\\') ||
    (value.nativePath && value.nativePath.split('/').some((part) => !part)) ||
    resolve(root.path, value.nativePath) !== value.path ||
    !within(root.path, value.path)
  )
    fail('native/physical mapping changed')
}
function sourceParent(value: NativePath): NativePath {
  return {
    nativePath: value.nativePath.split('/').slice(0, -1).join('/'),
    path: dirname(value.path),
  }
}
function identity(value: unknown, root: NativePath): asserts value is Identity {
  if (!object(value)) fail('invalid realpath identity')
  if (value.status === 'found') {
    keys(value, ['status', 'target', 'symlinks'])
    pathValue(value.target, root)
  } else {
    keys(value, ['status', 'symlinks'])
    if (value.status !== 'absent') fail('unsupported realpath outcome')
  }
  if (!Array.isArray(value.symlinks) || value.symlinks.length)
    fail('symlinks are not qualified')
}
function strictContext(
  value: unknown,
  root: NativePath
): asserts value is Context {
  keys(value, [
    'consumer',
    'configuredPath',
    'consumerPath',
    'lookupPath',
    'request',
    'chainIndex',
    'attemptIndex',
  ])
  if (!consumers.includes(value.consumer as Consumer))
    fail('unknown actual consumer')
  if (value.configuredPath !== null) {
    pathValue(value.configuredPath, root)
    if (!value.configuredPath.path.endsWith('.json'))
      fail('non-json configured native input')
  }
  pathValue(value.consumerPath, root)
  pathValue(value.lookupPath, root)
  text(value.request)
  integer(value.chainIndex)
  integer(value.attemptIndex)
}
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    object(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) =>
            Buffer.compare(Buffer.from(a), Buffer.from(b))
          )
        )
      : item
  )
}
function nativeContextKey(context: Context): string {
  // Match the v1 producer's actual context serialization order, not property
  // ordering supplied by a caller or alphabetical JavaScript key sorting.
  const path = (value: NativePath | null) =>
    value === null ? null : { nativePath: value.nativePath, path: value.path }
  return JSON.stringify({
    consumer: context.consumer,
    configuredPath: path(context.configuredPath),
    consumerPath: path(context.consumerPath),
    lookupPath: path(context.lookupPath),
    request: context.request,
    chainIndex: context.chainIndex,
    attemptIndex: context.attemptIndex,
  })
}
function compareOrder(left: RecordValue, right: RecordValue) {
  let result = Buffer.compare(
    Buffer.from(nativeContextKey(left.context)),
    Buffer.from(nativeContextKey(right.context))
  )
  if (result) return result
  for (let i = 0; i < Math.min(left.order.length, right.order.length); i++) {
    result = left.order[i] - right.order[i]
    if (result) return result
  }
  return (
    left.order.length - right.order.length ||
    ranks.indexOf(left.kind) - ranks.indexOf(right.kind) ||
    Buffer.compare(
      Buffer.from(left.path.nativePath),
      Buffer.from(right.path.nativePath)
    )
  )
}
function parseNative(
  value: unknown,
  request: NativeTsConfigRequest
): NativeTsConfigInputsV1 {
  keys(value, [
    'version',
    'kind',
    'mode',
    'environment',
    'route',
    'browserClient',
    'sourceCoverage',
    'entryId',
    'entryFile',
    'entryPath',
    'revision',
    'filesystemRoot',
    'projectPath',
    'complete',
    'reasons',
    'scripts',
    'records',
  ])
  if (
    value.version !== 1 ||
    value.kind !== 'native-typescript-config-inputs' ||
    value.mode !== request.profile.mode ||
    value.environment !== 'node' ||
    value.route !== null ||
    value.browserClient !== false ||
    value.sourceCoverage !== request.native.sourceCoverage ||
    value.entryId !== request.native.entryId ||
    value.entryFile !== request.native.entryFile ||
    value.entryPath !== request.native.entryPath ||
    value.revision !== request.revision ||
    !isDeepStrictEqual(value.filesystemRoot, request.native.filesystemRoot) ||
    !isDeepStrictEqual(value.projectPath, request.native.projectPath) ||
    value.complete !== true ||
    !Array.isArray(value.reasons) ||
    value.reasons.length ||
    !Array.isArray(value.scripts) ||
    !value.scripts.length ||
    !Array.isArray(value.records)
  )
    fail('foreign or incomplete native output')
  const root = request.native.filesystemRoot
  const scriptNames = new Set<string>()
  let previousScript = ''
  for (const script of value.scripts) {
    keys(script, ['path', 'sha256', 'mapPath', 'mapSha256'])
    text(script.path)
    hash(script.sha256)
    if (
      !/\.(?:[cm]?js)$/.test(script.path) ||
      !relativeArtifactPath(script.path) ||
      scriptNames.has(script.path) ||
      (previousScript &&
        Buffer.compare(Buffer.from(previousScript), Buffer.from(script.path)) >=
          0)
    )
      fail('invalid native script inventory')
    previousScript = script.path
    scriptNames.add(script.path)
    if (script.mapPath === null) {
      if (script.mapSha256 !== null) fail('invalid map absence')
    } else {
      if (script.mapPath !== script.path + '.map')
        fail('invalid native map identity')
      hash(script.mapSha256)
    }
  }
  const records: RecordValue[] = []
  for (const record of value.records) {
    keys(record, ['context', 'order', 'kind', 'path', 'fact'])
    strictContext(record.context, root)
    pathValue(record.path, root)
    if (!Array.isArray(record.order)) fail('invalid native order')
    record.order.forEach(integer)
    const fact = record.fact
    switch (record.kind) {
      case 'selection':
        keys(fact, ['selected'])
        if (fact.selected !== null) pathValue(fact.selected, root)
        if (record.context.chainIndex !== 0)
          fail('invalid root native selection chain')
        break
      case 'fixed-metadata':
        keys(fact, ['succeeded', 'observed', 'identity'])
        identity(fact.identity, root)
        if (
          typeof fact.succeeded !== 'boolean' ||
          fact.observed !== (fact.succeeded ? 'file' : 'absent') ||
          fact.identity.status !== (fact.succeeded ? 'found' : 'absent')
        )
          fail('unqualified Fixed outcome')
        break
      case 'config-read':
        keys(fact, ['status', 'sha256', 'observed', 'identity'])
        identity(fact.identity, root)
        hash(fact.sha256)
        if (
          !['parsed', 'empty'].includes(fact.status as string) ||
          fact.observed !== 'file' ||
          fact.identity.status !== 'found' ||
          !record.path.path.endsWith('.json')
        )
          fail('unqualified selected config read')
        if (
          !isDeepStrictEqual(
            record.context.lookupPath,
            sourceParent(record.path)
          )
        )
          fail('native config read lookup differs from its source parent')
        break
      case 'extends':
        keys(fact, ['request', 'primary', 'affectingSourceReferences'])
        text(fact.request)
        if (
          !/^(?:\.\.?\/|\/).+\.json$/.test(fact.request) ||
          /[?#\\]/.test(fact.request) ||
          fact.request !== record.context.request ||
          !Array.isArray(fact.primary) ||
          fact.primary.length !== 1 ||
          !Array.isArray(fact.affectingSourceReferences) ||
          fact.affectingSourceReferences.length
        )
          fail('unsupported native extends')
        for (const primary of fact.primary) {
          keys(primary, ['request', 'conditions', 'result'])
          if (primary.request !== null) text(primary.request)
          if (!Array.isArray(primary.conditions) || primary.conditions.length)
            fail('conditional native extends')
          keys(primary.result, ['kind', 'path'])
          if (primary.result.kind !== 'source')
            fail('non-source native extends')
          pathValue(primary.result.path, root)
        }
        break
      case 'realpath':
        identity(fact, root)
        break
      case 'directory':
        keys(fact, ['found'])
        if (typeof fact.found !== 'boolean')
          fail('invalid directory observation')
        break
      case 'candidate':
        keys(fact, ['requested', 'observed'])
        if (
          !['entry', 'file'].includes(fact.requested as string) ||
          !['file', 'absent'].includes(fact.observed as string)
        )
          fail('unqualified native candidate')
        break
      default:
        fail('unsupported/incomplete native observation')
    }
    const typed = record as unknown as RecordValue
    if (records.length && compareOrder(records[records.length - 1], typed) >= 0)
      fail('duplicate or unordered native observations')
    records.push(typed)
  }
  const selections = new Map<string, NativePath | null>()
  const reads = new Map<string, RecordValue & { kind: 'config-read' }>()
  const inheritance: (RecordValue & { kind: 'extends' })[] = []
  const roles = new Set<string>()
  for (const record of records) {
    const owner = ownerKey(record.context)
    if (record.kind === 'selection') {
      roles.add(record.context.consumer)
      if (
        selections.has(owner) &&
        !isDeepStrictEqual(selections.get(owner), record.fact.selected)
      )
        fail('contradictory actual selection')
      selections.set(owner, record.fact.selected)
    }
    if (record.kind === 'config-read') {
      const key = canonical([owner, record.context.chainIndex, record.path])
      if (
        reads.has(key) &&
        !isDeepStrictEqual(reads.get(key)!.fact, record.fact)
      )
        fail('contradictory actual config read')
      reads.set(key, record)
    }
    if (record.kind === 'extends') inheritance.push(record)
  }
  if (consumers.some((consumer) => !roles.has(consumer)))
    fail('missing actual consumer')
  for (const [owner, selected] of selections)
    if (selected && !reads.has(canonical([owner, 0, selected])))
      fail('selected native read missing')
  for (const record of reads.values()) {
    const owner = ownerKey(record.context)
    if (!record.context.chainIndex) {
      if (!isDeepStrictEqual(selections.get(owner), record.path))
        fail('read lacks actual selection')
    } else if (
      !inheritance.some(
        (item) =>
          ownerKey(item.context) === owner &&
          item.context.chainIndex + 1 === record.context.chainIndex &&
          isDeepStrictEqual(item.fact.primary[0].result.path, record.path)
      )
    )
      fail('inherited read lacks actual result')
  }
  for (const record of inheritance) {
    const owner = ownerKey(record.context)
    if (
      ![...reads.values()].some(
        (read) =>
          ownerKey(read.context) === owner &&
          read.context.chainIndex === record.context.chainIndex &&
          read.fact.status === 'parsed' &&
          isDeepStrictEqual(sourceParent(read.path), record.path) &&
          isDeepStrictEqual(record.context.lookupPath, record.path)
      )
    )
      fail('native extends lacks its current parsed read')
    if (
      !reads.has(
        canonical([
          owner,
          record.context.chainIndex + 1,
          record.fact.primary[0].result.path,
        ])
      )
    )
      fail('native result was not consumed')
  }
  return value as unknown as NativeTsConfigInputsV1
}
function ownerKey(context: Context) {
  return canonical([
    context.consumer,
    context.consumerPath,
    context.configuredPath,
  ])
}
function relativeArtifactPath(value: string) {
  return (
    !!value &&
    !isAbsolute(value) &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    !value.split('/').some((part) => !part || part === '.' || part === '..')
  )
}
function copy<T>(value: T): T {
  // This private protocol is JSON data. Adopt cloned plain records into this
  // realm so native structuredClone/IPC prototypes cannot grant or deny identity.
  // Unsupported object kinds fail rather than losing Map/Date contents.
  const adopt = (item: unknown): unknown => {
    if (Array.isArray(item)) return Array.from(item, adopt)
    if (item && typeof item === 'object') {
      if (Object.prototype.toString.call(item) !== '[object Object]')
        fail('non-record protocol value')
      return Object.fromEntries(
        Object.entries(item).map(([key, entry]) => [key, adopt(entry)])
      )
    }
    return item
  }
  return adopt(structuredClone(value)) as T
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item)
    Object.freeze(value)
  }
  return value
}
async function fileKind(
  path: string,
  check: () => void
): Promise<'file' | 'directory' | 'absent'> {
  physical(path)
  const root = parse(path).root
  let current = root
  const parts = relative(root, path).split(sep).filter(Boolean)
  for (let i = 0; i <= parts.length; i++) {
    check()
    if (i) current = join(current, parts[i - 1])
    let stat
    try {
      stat = await lstat(current)
    } catch (error) {
      check()
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent'
      throw error
    }
    check()
    if (stat.isSymbolicLink()) fail('symlink filesystem input')
    if (i < parts.length && !stat.isDirectory()) fail('non-directory ancestor')
    if (i === parts.length) {
      const canonicalPath = await realpath(current)
      check()
      if (canonicalPath !== path) fail('physical identity changed')
      if (stat.isFile()) return 'file'
      if (stat.isDirectory()) return 'directory'
      fail('unsupported filesystem entry')
    }
  }
  fail('invalid physical path')
}
async function readRegular(path: string, check: () => void) {
  if ((await fileKind(path, check)) !== 'file')
    fail('required regular input missing')
  check()
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    check()
    const before = await handle.stat()
    check()
    const bytes = await handle.readFile()
    check()
    const after = await handle.stat()
    check()
    if (
      !before.isFile() ||
      !isDeepStrictEqual(
        [before.dev, before.ino, before.size, before.mtimeMs, before.ctimeMs],
        [after.dev, after.ino, after.size, after.mtimeMs, after.ctimeMs]
      ) ||
      (await fileKind(path, check)) !== 'file'
    )
      fail('input changed during read')
    const pathStat = await lstat(path)
    check()
    if (
      !isDeepStrictEqual(
        [
          pathStat.dev,
          pathStat.ino,
          pathStat.size,
          pathStat.mtimeMs,
          pathStat.ctimeMs,
        ],
        [after.dev, after.ino, after.size, after.mtimeMs, after.ctimeMs]
      )
    )
      fail('input path changed during read')
    return bytes
  } finally {
    await handle.close()
    check()
  }
}
async function assertInputs(value: NativeTsConfigInputsV1, check: () => void) {
  const watch = new Map<string, NativeTsConfigWatchInput>()
  for (const record of value.records) {
    check()
    switch (record.kind) {
      case 'selection':
        break
      case 'extends':
        break
      case 'config-read': {
        const bytes = await readRegular(record.path.path, check)
        if (
          coverageHash(bytes) !== record.fact.sha256 ||
          (record.fact.status === 'empty' && bytes.length)
        )
          fail('actual native config bytes changed')
        break
      }
      case 'directory': {
        const kind = await fileKind(record.path.path, check)
        if (kind !== (record.fact.found ? 'directory' : 'absent'))
          fail('actual directory outcome changed')
        if (record.fact.found) {
          await readdir(record.path.path)
          check()
        }
        break
      }
      case 'candidate':
        if ((await fileKind(record.path.path, check)) !== record.fact.observed)
          fail('actual native candidate changed')
        break
      case 'fixed-metadata':
        if ((await fileKind(record.path.path, check)) !== record.fact.observed)
          fail('actual Fixed metadata changed')
        break
      case 'realpath':
        if (record.fact.status === 'absent') {
          if ((await fileKind(record.path.path, check)) !== 'absent')
            fail('actual native absence changed')
        } else if (
          !isDeepStrictEqual(record.fact.target, record.path) ||
          (await fileKind(record.path.path, check)) === 'absent'
        )
          fail('actual native realpath changed')
        break
    }
    if (
      (record.kind === 'config-read' || record.kind === 'fixed-metadata') &&
      record.fact.identity.status === 'found' &&
      !isDeepStrictEqual(record.fact.identity.target, record.path)
    )
      fail('non-canonical native input')
    if (record.kind !== 'selection' && record.kind !== 'extends') {
      const kind =
        record.kind === 'directory'
          ? record.fact.found
            ? 'directory'
            : 'absence'
          : record.kind === 'realpath'
            ? record.fact.status === 'absent'
              ? 'absence'
              : 'file'
            : record.kind === 'candidate' || record.kind === 'fixed-metadata'
              ? record.fact.observed === 'absent'
                ? 'absence'
                : 'file'
              : 'file'
      watch.set(record.path.path, { path: record.path.path, kind })
    }
  }
  check()
  return [...watch.values()].sort((a, b) =>
    Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))
  )
}
function assertRequest(
  request: NativeTsConfigRequest,
  artifact: CompiledTestArtifact,
  artifactRoot: string
) {
  keys(request, [
    'version',
    'role',
    'id',
    'revision',
    'profile',
    'source',
    'native',
  ])
  opaque(request.id)
  opaque(request.revision)
  keys(request.profile, ['id', 'mode', 'environment', 'runtime', 'bundler'])
  text(request.profile.id)
  keys(request.source, ['id', 'file', 'sha256'])
  text(request.source.id)
  physical(request.source.file)
  hash(request.source.sha256)
  keys(request.native, [
    'entryId',
    'entryFile',
    'entryPath',
    'sourceCoverage',
    'filesystemRoot',
    'projectPath',
  ])
  keys(request.native.filesystemRoot, ['nativePath', 'path'])
  physical(request.native.filesystemRoot.path)
  if (request.native.filesystemRoot.nativePath !== '')
    fail('unsupported native filesystem root')
  pathValue(request.native.projectPath, request.native.filesystemRoot)
  if (
    request.version !== 1 ||
    !['compiler-source', 'runtime'].includes(request.role) ||
    !request.profile.id ||
    !['development', 'production'].includes(request.profile.mode) ||
    request.profile.environment !== 'node' ||
    request.profile.runtime !== 'nodejs' ||
    request.profile.bundler !== 'turbopack' ||
    !request.source.id ||
    request.native.entryId !==
      createHash('sha256').update(request.source.id).digest('hex') ||
    request.native.entryPath !==
      `server/next-test/${request.native.entryId}.js` ||
    request.native.entryFile !==
      relative(request.native.projectPath.path, request.source.file)
        .split(sep)
        .join('/') ||
    !relativeArtifactPath(request.native.entryFile) ||
    request.native.sourceCoverage !== (request.profile.mode === 'production') ||
    artifact.version !== 2 ||
    artifact.kind !== 'node' ||
    !isDeepStrictEqual(artifact.profile, request.profile) ||
    artifact.rootDir !== artifactRoot ||
    artifact.entryId !== request.source.id ||
    artifact.revision !== request.revision ||
    artifact.sourceHash !== request.source.sha256 ||
    artifact.entryPath !== request.native.entryPath ||
    artifact.coverage?.version !== 1 ||
    artifact.cohort ||
    artifact.moduleMocking ||
    artifact.moduleCache ||
    artifact.dynamicModuleMocking
  )
    fail('foreign parent request or artifact')
  physical(artifactRoot)
  if (request.role === 'compiler-source') {
    if (
      !isDeepStrictEqual(artifact.coverage.sourceAnalysis, {
        version: 1,
        file: request.source.file,
        sha256: request.source.sha256,
      }) ||
      artifact.runtimeConfigurationImports ||
      artifact.setupFiles?.length ||
      artifact.snapshotSerializers?.length
    )
      fail('compiler-source role required')
  } else if (artifact.coverage.sourceAnalysis) fail('runtime role required')
}

/** Private only: caller supplies the independent actual native issuer/lease. */
export async function prepareNativeTsConfigInputs(options: {
  artifact: CompiledTestArtifact
  reference: NativeTsConfigInputsReference | undefined
  authorization: NativeTsConfigLeaseAuthorization | undefined
  signal: AbortSignal
}): Promise<
  | {
      watchInputs: readonly NativeTsConfigWatchInput[]
      seal(): Promise<ParentNativeTsConfigFact>
    }
  | undefined
> {
  const {
    authorization,
    artifact: inputArtifact,
    reference: inputReference,
    signal,
  } = options
  signal.throwIfAborted()
  const assertLease = authorization?.assertLease
  if (authorization === undefined) {
    if (inputReference !== undefined) fail('unrequested native reference')
    return undefined
  }
  if (typeof assertLease !== 'function')
    fail('independent native issuer required')
  keys(authorization, ['request', 'artifactRoot', 'assertLease'])
  const request = freeze(copy(authorization.request))
  const artifactRoot = authorization.artifactRoot
  const artifact = freeze(copy(inputArtifact))
  const reference = freeze(copy(inputReference))
  function check() {
    signal.throwIfAborted()
    if (Reflect.apply(assertLease!, authorization, []) !== undefined)
      fail('native lease must return synchronously with undefined')
  }
  check()
  assertRequest(request, artifact, artifactRoot)
  keys(reference, ['version', 'nativeMetadata'])
  keys(reference.nativeMetadata, ['path', 'sha256'])
  const expectedPath = request.native.entryPath.replace(
    /\.js$/,
    '.tsconfig-inputs.json'
  )
  if (
    reference.version !== 1 ||
    reference.nativeMetadata.path !== expectedPath ||
    !Array.isArray(artifact.files) ||
    artifact.files.length !== new Set(artifact.files).size ||
    !artifact.files.includes(expectedPath)
  )
    fail('missing actual listed native sidecar')
  hash(reference.nativeMetadata.sha256)
  for (const file of artifact.files)
    if (!relativeArtifactPath(file)) fail('invalid artifact inventory')
  async function read() {
    check()
    if (
      (await fileKind(artifactRoot, check)) !== 'directory' ||
      (await fileKind(request.native.filesystemRoot.path, check)) !==
        'directory' ||
      (await fileKind(request.native.projectPath.path, check)) !==
        'directory' ||
      coverageHash(await readRegular(request.source.file, check)) !==
        request.source.sha256
    )
      fail('parent input identity changed')
    const bytes = await readRegular(join(artifactRoot, expectedPath), check)
    if (coverageHash(bytes) !== reference!.nativeMetadata.sha256)
      fail('native sidecar bytes changed')
    if (request.profile.mode === 'production') {
      await verifySourceCoverageArtifact(artifact)
      check()
    }
    const native = parseNative(JSON.parse(bytes.toString('utf8')), request)
    const scripts = artifact.files
      .filter((file) => /\.(?:[cm]?js)$/.test(file))
      .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    if (
      !isDeepStrictEqual(
        scripts,
        native.scripts.map((script) => script.path)
      ) ||
      !scripts.includes(artifact.entryPath)
    )
      fail('incomplete actual script inventory')
    if (
      !isDeepStrictEqual(
        artifact.files
          .filter((file) => /\.(?:[cm]?js)\.map$/.test(file))
          .sort(),
        native.scripts
          .flatMap((script) =>
            script.mapPath === null ? [] : [script.mapPath]
          )
          .sort()
      )
    )
      fail('incomplete actual map inventory')
    for (const script of native.scripts) {
      if (
        coverageHash(
          await readRegular(join(artifactRoot, script.path), check)
        ) !== script.sha256
      )
        fail('native script bytes changed')
      if (script.mapPath === null) {
        if (
          artifact.files.includes(script.path + '.map') ||
          (await fileKind(join(artifactRoot, script.path + '.map'), check)) !==
            'absent'
        )
          fail('native map absence changed')
      } else if (
        !artifact.files.includes(script.mapPath) ||
        coverageHash(
          await readRegular(join(artifactRoot, script.mapPath), check)
        ) !== script.mapSha256
      )
        fail('native map bytes changed')
    }
    const watchInputs = await assertInputs(native, check)
    check()
    return { native, watchInputs }
  }
  const initial = await read()
  let used = false
  return {
    watchInputs: freeze(initial.watchInputs),
    async seal(): Promise<ParentNativeTsConfigFact> {
      if (used) fail('native seal already consumed')
      used = true
      const after = await read()
      check()
      if (!isDeepStrictEqual(after, initial))
        fail('native input snapshot changed')
      const fact = freeze({
        version: 1 as const,
        kind: 'next-parent-native-tsconfig-inputs' as const,
        request,
        compiler: {
          entryId: artifact.entryId,
          revision: artifact.revision,
          rootDir: artifactRoot,
        },
        reference: reference as unknown as NativeTsConfigInputsReference,
        native: after.native,
      })
      issued.set(fact, request)
      return fact
    },
  }
}

/** Publication/cache rechecks a locally sealed fact under its original authority. */
export async function assertParentNativeTsConfigFact(options: {
  fact: ParentNativeTsConfigFact
  expected: NativeTsConfigRequest
  signal: AbortSignal
}): Promise<void> {
  const { fact, signal } = options
  const expected = freeze(copy(options.expected))
  const original = issued.get(fact)
  if (
    !original ||
    !isDeepStrictEqual(original, expected) ||
    !isDeepStrictEqual(fact.request, original)
  )
    fail('parent fact lacks its original issuer/request')
  const check = () => signal.throwIfAborted()
  check()
  if (
    coverageHash(await readRegular(expected.source.file, check)) !==
    expected.source.sha256
  )
    fail('parent source changed after native seal')
  await assertInputs(fact.native, check)
  check()
}

/** Schema replay only. This neither establishes native origin nor issues a parent fact. */
export function validateNativeTsConfigInputsSchema(
  value: unknown,
  expected: NativeTsConfigRequest
): NativeTsConfigInputsV1 {
  return parseNative(value, expected)
}
