import { isDeepStrictEqual } from 'util'
import {
  readTestingDefaultConfiguration,
  assertTestingDefaultConfigurationEnvironment,
} from '../../../server/config-testing-policy'
import { createNativeOpaqueIdentity } from './native-opaque-identity'
import {
  prepareNativeTsConfigInputs as prepareNativeInputReader,
  assertParentNativeTsConfigFact,
  type NativeTsConfigRequest,
  type NativeTsConfigInputsReference,
  type NativeTsConfigLeaseAuthorization,
  type ParentNativeTsConfigFact,
} from '../coverage/native-tsconfig-inputs'
import { writeRuntimeConfigurationImportProof } from './runtime-config-proof'
import { assertConfigurationImportObservation } from './config-imports'
import { assertConfigurationImportFiles } from './config-import-facts'
import {
  writeConfigurationImportProof,
  type ConfigurationImportAuthorization,
} from './config-import-proof'
import { withCompilerAliases } from './aliases'
import { materializeExternalLayout } from './external-layout'
import { createCompiledRouteRenderOpts } from './route-render'
import { readNativeMockCoverageSources } from '../coverage/mock-sources'
import {
  readCreatorClientDescriptor as readClientDescriptor,
  hashClientOutputs,
} from './client'
import { createHash, randomUUID } from 'crypto'
import { constants } from 'fs'
import {
  mkdir,
  open,
  mkdtemp,
  rename,
  rm,
  lstat,
  readdir,
  readFile,
  realpath,
  writeFile,
} from 'fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'path'
import { printNonFatalIssue } from '../../../server/dev/turbopack-utils'
import { loadBindings } from '../../../build/swc'
import { Lockfile } from '../../../build/lockfile'
import { createDevTurbopackProject } from '../../../build/swc/dev-project'
import { createProductionProjectOptions } from '../../../build/swc/production-project'
import { generateBuildId } from '../../../build/generate-build-id'
import { generatePreviewKeys } from '../../../build/preview-key-utils'
import { generateEncryptionKeyBase64 } from '../../../server/app-render/encryption-utils-server'
import loadCustomRoutes from '../../../lib/load-custom-routes'
import { setupFsCheck } from '../../../server/lib/router-utils/filesystem'
import { writeDevRequestManifests } from '../../../server/lib/router-utils/write-dev-request-manifests'
import { formatIssue } from '../../../shared/lib/turbopack/utils'
import { loadTestCompilerConfig, validateTestProfile } from './watch-options'
import { withCompilerTransforms } from './transform-config'
import { assertTransformSource } from './transform-hooks'
import { buildCoverageMetadata } from '../coverage/artifact'
import type { CompiledCoverageSource } from '../coverage/types'
import { sourceAnalysisEntryId } from '../coverage/source-analysis'
import { readSourceCoverageProof } from '../coverage/source-profile'
import { readImportCoverageProof } from '../coverage/import-roles'
import { buildBrowserCoverageMetadata } from '../client/coverage-artifact'
import { validateCompiledTestRoute } from '../rsc/route'
import { usesInSourceTestMarker } from '../in-source'
import { readSourceDependencyAsset } from '../incremental/source-selection'
import type {
  CompiledTestArtifact,
  CompiledTestRoute,
  CompiledTestCohort,
  CompiledNodeTestArtifact,
  CompileTestOptions,
  TestEntry,
  TestProfile,
  TestCompilerSessionOptions,
} from '../contracts'

export type NativeTsConfigParentSelection = Pick<
  NativeTsConfigRequest,
  'version' | 'id' | 'revision' | 'profile' | 'source'
>
export type SessionNativeTsConfigCompilation =
  | Readonly<{
      version: 1
      kind: 'next-session-native-tsconfig'
      role: 'runtime'
      request: NativeTsConfigRequest
      value: CompiledNodeTestArtifact
    }>
  | Readonly<{
      version: 1
      kind: 'next-session-native-tsconfig'
      role: 'compiler-source'
      request: NativeTsConfigRequest
      value: CompiledCoverageSource
    }>
type NativeRole = NativeTsConfigRequest['role']
type NativeLeaseState = { disposed: boolean }
type NativeOperationState = { aborted: boolean }
type NativeInventory = readonly { path: string; contentHash: string }[]
interface NativeEmission {
  artifact: CompiledNodeTestArtifact
  request: NativeTsConfigRequest
  reference: NativeTsConfigInputsReference
  inventory: NativeInventory
}
interface NativeCompileContext {
  role: NativeRole
  selection: NativeTsConfigParentSelection
  operation: NativeOperationState
  emission?: NativeEmission
}
interface NativeIssue extends NativeEmission {
  identity: object
  state: NativeLeaseState
  operation: NativeOperationState
  authorization: NativeTsConfigLeaseAuthorization
}
const nativeCompilations = new WeakMap<
  SessionNativeTsConfigCompilation,
  NativeIssue
>()
const nativeSealedFacts = new WeakMap<
  ParentNativeTsConfigFact,
  {
    identity: object
    request: NativeTsConfigRequest
    compiler: { entryId: string; revision: string; rootDir: string }
    reference: NativeTsConfigInputsReference
    inventory: NativeInventory
  }
>()
function nativeFailure(reason: string): never {
  throw new Error(
    `Invalid Session native TypeScript config authority: ${reason}`
  )
}
function nativeKeys(value: unknown, names: readonly string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Reflect.ownKeys(value).length !== names.length ||
    !names.every((key) => {
      const d = Object.getOwnPropertyDescriptor(value, key)
      return !!d && 'value' in d && d.enumerable
    })
  )
    nativeFailure('exact data shape required')
}
function nativeCopy<T>(value: T): T {
  if (typeof value === 'function' || typeof value === 'symbol')
    nativeFailure('data-only authority required')
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => nativeCopy(item)) as T
  if (
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    nativeFailure('plain authority required')
  const entries = Reflect.ownKeys(value).map((key) => {
    const d = Object.getOwnPropertyDescriptor(value, key)!
    if (typeof key !== 'string' || !('value' in d) || !d.enumerable)
      nativeFailure('data descriptor required')
    return [key, nativeCopy(d.value)]
  })
  return Object.fromEntries(entries) as T
}
function nativeFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) nativeFreeze(child)
    Object.freeze(value)
  }
  return value
}
function nativeSelection(
  value: NativeTsConfigParentSelection,
  profile: TestProfile
) {
  const selected = nativeCopy(value)
  nativeKeys(selected, ['version', 'id', 'revision', 'profile', 'source'])
  nativeKeys(selected.profile, [
    'id',
    'mode',
    'environment',
    'runtime',
    'bundler',
  ])
  nativeKeys(selected.source, ['id', 'file', 'sha256'])
  if (
    selected.version !== 1 ||
    !isDeepStrictEqual(selected.profile, profile) ||
    typeof profile.id !== 'string' ||
    !profile.id ||
    profile.environment !== 'node' ||
    profile.runtime !== 'nodejs' ||
    profile.bundler !== 'turbopack' ||
    !['development', 'production'].includes(profile.mode) ||
    ![selected.id, selected.revision].every(
      (v) =>
        typeof v === 'string' &&
        v.length > 0 &&
        !v.includes('\0') &&
        Buffer.byteLength(v) <= 256
    ) ||
    typeof selected.source.id !== 'string' ||
    !selected.source.id ||
    typeof selected.source.file !== 'string' ||
    !isAbsolute(selected.source.file) ||
    resolve(selected.source.file) !== selected.source.file ||
    !/^[a-f0-9]{64}$/.test(selected.source.sha256)
  )
    nativeFailure('foreign parent selection')
  if (!/^[a-zA-Z0-9.-]{1,244}$/.test(selected.revision))
    nativeFailure('private revision must fit the generated artifact basename')
  return nativeFreeze(selected)
}
function assertNativeIssueLive(issue: NativeIssue) {
  if (
    Reflect.apply(issue.authorization.assertLease, issue.authorization, []) !==
    undefined
  )
    nativeFailure('lease must return synchronously with undefined')
}
// This factory is module-level: callbacks retain only detached small state/data.
async function readFirstNativeSidecar(
  root: string,
  file: string,
  state: NativeLeaseState,
  signal: AbortSignal
) {
  const path = artifactPath(root, file)
  const check = () => {
    signal.throwIfAborted()
    if (state.disposed) nativeFailure('original allocation lease is closed')
  }
  check()
  if (
    (await realpath(root)) !== root ||
    (await realpath(path)) !== path ||
    !(await lstat(path)).isFile()
  )
    nativeFailure('noncanonical native sidecar')
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
    const named = await lstat(path)
    check()
    const identity = (stat: typeof before) => [
      stat.dev,
      stat.ino,
      stat.size,
      stat.mtimeMs,
      stat.ctimeMs,
    ]
    if (
      !before.isFile() ||
      !named.isFile() ||
      (await realpath(path)) !== path ||
      !isDeepStrictEqual(identity(before), identity(after)) ||
      !isDeepStrictEqual(identity(after), identity(named))
    )
      nativeFailure('native sidecar changed during first read')
    check()
    return bytes
  } finally {
    await handle.close()
    check()
  }
}
function trackNativeOperation(signal: AbortSignal) {
  signal.throwIfAborted()
  const state: NativeOperationState = { aborted: false }
  const revoke = () => {
    state.aborted = true
  }
  signal.addEventListener('abort', revoke, { once: true })
  return { state, detach: () => signal.removeEventListener('abort', revoke) }
}
function nativeLeaseAuthorization(
  state: NativeLeaseState,
  operation: NativeOperationState,
  request: NativeTsConfigRequest,
  artifactRoot: string
): NativeTsConfigLeaseAuthorization {
  return Object.freeze({
    request,
    artifactRoot,
    assertLease() {
      if (state.disposed) nativeFailure('original allocation lease is closed')
      if (operation.aborted)
        nativeFailure('original compile operation was cancelled')
    },
  })
}
function issueNativeCompilation(
  state: NativeLeaseState,
  context: NativeCompileContext,
  value: CompiledNodeTestArtifact | CompiledCoverageSource,
  signal: AbortSignal
): SessionNativeTsConfigCompilation {
  signal.throwIfAborted()
  if (context.operation.aborted)
    nativeFailure('original compile operation was cancelled')
  if (state.disposed || !context.emission)
    nativeFailure('missing live native emission')
  const emission = context.emission
  if (
    (context.role === 'runtime'
      ? value
      : (value as CompiledCoverageSource).artifact) !== emission.artifact
  )
    nativeFailure('foreign emitted artifact')
  const wrapper = nativeFreeze({
    version: 1 as const,
    kind: 'next-session-native-tsconfig' as const,
    role: context.role,
    request: emission.request,
    value,
  }) as SessionNativeTsConfigCompilation
  nativeCompilations.set(wrapper, {
    ...emission,
    identity: createNativeOpaqueIdentity(),
    state,
    operation: context.operation,
    authorization: nativeLeaseAuthorization(
      state,
      context.operation,
      emission.request,
      emission.artifact.rootDir
    ),
  })
  return wrapper
}
// No Session/native handles are captured by these stage/seal closures.
async function prepareIssuedNativeCompilation(
  issue: NativeIssue,
  signal: AbortSignal
) {
  signal.throwIfAborted()
  assertNativeIssueLive(issue)
  const staged = await prepareNativeInputReader({
    artifact: issue.artifact,
    reference: issue.reference,
    authorization: issue.authorization,
    signal,
  })
  signal.throwIfAborted()
  assertNativeIssueLive(issue)
  if (!staged) nativeFailure('missing native preparation')
  return Object.freeze({
    watchInputs: staged.watchInputs,
    async seal() {
      signal.throwIfAborted()
      assertNativeIssueLive(issue)
      const fact = await staged.seal()
      signal.throwIfAborted()
      assertNativeIssueLive(issue)
      // Retained facts hold bounded data only, no callback, lease state or Session.
      nativeSealedFacts.set(
        fact,
        nativeFreeze({
          identity: issue.identity,
          request: issue.request,
          compiler: { ...fact.compiler },
          reference: issue.reference,
          inventory: issue.inventory,
        })
      )
      return fact
    },
  })
}
/** Retained original inputs/origin only; this never authorizes live conversion. */
export async function assertSealedSessionNativeTsConfigInputs(options: {
  fact: ParentNativeTsConfigFact
  expected: {
    request: NativeTsConfigRequest
    compiler: { entryId: string; revision: string; rootDir: string }
  }
  signal: AbortSignal
}) {
  const { fact, signal } = options
  const expected = nativeFreeze(nativeCopy(options.expected))
  const original = nativeSealedFacts.get(fact)
  if (
    !original ||
    !isDeepStrictEqual(expected, {
      request: original.request,
      compiler: original.compiler,
    }) ||
    !isDeepStrictEqual(fact.reference, original.reference)
  )
    nativeFailure('fact lacks its original genuine Session issuer')
  await assertParentNativeTsConfigFact({
    fact,
    expected: original.request,
    signal,
  })
  signal.throwIfAborted()
}

declare const nativeRuntimeGrantBrand: unique symbol
/** Private parent authority; visible data or serialization cannot recreate it. */
export interface SessionNativeRuntimeConversionGrant {
  readonly [nativeRuntimeGrantBrand]: true
}
interface NativeRuntimeGrant {
  issue: NativeIssue
  fact: ParentNativeTsConfigFact
  original: NonNullable<ReturnType<typeof nativeSealedFacts.get>>
  signal: AbortSignal | undefined
  staged: Awaited<ReturnType<typeof prepareNativeInputReader>>
  phase: 'prepared' | 'sealing' | 'sealed' | 'failed' | 'retired'
}
const nativeRuntimeGrants = new WeakMap<
  SessionNativeRuntimeConversionGrant,
  NativeRuntimeGrant
>()

function assertNativeRuntimeOriginal(
  issue: NativeIssue,
  fact: ParentNativeTsConfigFact,
  original: NativeRuntimeGrant['original'],
  artifact: CompiledTestArtifact,
  signal: AbortSignal
) {
  signal.throwIfAborted()
  assertNativeIssueLive(issue)
  const marker = Object.getOwnPropertyDescriptor(
    artifact,
    'nativeTsConfigInputs'
  )
  if (
    nativeSealedFacts.get(fact) !== original ||
    original.identity !== issue.identity ||
    original.request !== issue.request ||
    original.reference !== issue.reference ||
    original.inventory !== issue.inventory ||
    issue.request.role !== 'runtime' ||
    issue.artifact !== artifact ||
    !marker ||
    !('value' in marker) ||
    marker.value !== issue.reference ||
    !isDeepStrictEqual(fact.request, issue.request) ||
    !isDeepStrictEqual(fact.reference, issue.reference) ||
    !isDeepStrictEqual(original.compiler, {
      entryId: artifact.entryId,
      revision: artifact.revision,
      rootDir: artifact.rootDir,
    }) ||
    !isDeepStrictEqual(fact.compiler, original.compiler)
  )
    nativeFailure('runtime fact lacks its original live emission')
  signal.throwIfAborted()
  assertNativeIssueLive(issue)
}

/** Start only from the actual wrapper and the original fact for that emission. */
export async function prepareSessionNativeRuntimeConversion(options: {
  compilation: SessionNativeTsConfigCompilation
  artifact: CompiledTestArtifact
  fact: ParentNativeTsConfigFact
  selection: NativeTsConfigParentSelection
  signal: AbortSignal
}): Promise<SessionNativeRuntimeConversionGrant> {
  nativeKeys(options, [
    'compilation',
    'artifact',
    'fact',
    'selection',
    'signal',
  ])
  const { compilation, artifact, fact, signal } = options
  signal.throwIfAborted()
  const issue = nativeCompilations.get(compilation)
  const original = nativeSealedFacts.get(fact)
  if (
    !issue ||
    !original ||
    compilation.role !== 'runtime' ||
    compilation.value !== artifact
  )
    nativeFailure('missing original runtime compilation/fact identity')
  const selected = nativeSelection(options.selection, issue.request.profile)
  if (
    !isDeepStrictEqual(selected, {
      version: issue.request.version,
      id: issue.request.id,
      revision: issue.request.revision,
      profile: issue.request.profile,
      source: issue.request.source,
    })
  )
    nativeFailure('foreign runtime parent selection')
  const check = () =>
    assertNativeRuntimeOriginal(issue, fact, original, artifact, signal)
  check()
  await assertSealedSessionNativeTsConfigInputs({
    fact,
    expected: { request: issue.request, compiler: original.compiler },
    signal,
  })
  check()
  const staged = await prepareNativeInputReader({
    artifact: issue.artifact,
    reference: issue.reference,
    authorization: issue.authorization,
    signal,
  })
  check()
  if (!staged) nativeFailure('missing runtime native preparation')
  const grant =
    createNativeOpaqueIdentity() as SessionNativeRuntimeConversionGrant
  nativeRuntimeGrants.set(grant, {
    issue,
    fact,
    original,
    signal,
    staged,
    phase: 'prepared',
  })
  return grant
}

/** Live checks retain the original detached state, never a replacement Session. */
export function assertSessionNativeRuntimeConversion(
  grant: SessionNativeRuntimeConversionGrant,
  artifact: CompiledTestArtifact,
  fact: ParentNativeTsConfigFact,
  signal: AbortSignal
): void {
  const retained = nativeRuntimeGrants.get(grant)
  if (
    !retained ||
    retained.signal !== signal ||
    retained.fact !== fact ||
    retained.phase === 'failed' ||
    retained.phase === 'retired'
  )
    nativeFailure('missing active runtime native grant')
  assertNativeRuntimeOriginal(
    retained.issue,
    fact,
    retained.original,
    artifact,
    signal
  )
}

/** Current observations never replace or Session-register the original fact. */
export async function sealSessionNativeRuntimeConversion(
  grant: SessionNativeRuntimeConversionGrant,
  artifact: CompiledTestArtifact,
  fact: ParentNativeTsConfigFact,
  signal: AbortSignal
): Promise<void> {
  assertSessionNativeRuntimeConversion(grant, artifact, fact, signal)
  const retained = nativeRuntimeGrants.get(grant)!
  if (retained.phase !== 'prepared' || !retained.staged)
    nativeFailure('runtime native seal already consumed')
  const staged = retained.staged
  retained.staged = undefined
  retained.phase = 'sealing'
  try {
    const observed = await staged.seal()
    assertSessionNativeRuntimeConversion(grant, artifact, fact, signal)
    if (!isDeepStrictEqual(observed, fact))
      nativeFailure('runtime native observations differ from original fact')
    retained.phase = 'sealed'
    assertSessionNativeRuntimeConversion(grant, artifact, fact, signal)
  } catch (error) {
    retained.phase = 'failed'
    throw error
  }
}

/** Cleanup is idempotent and cannot create or transfer authority. */
export function retireSessionNativeRuntimeConversion(
  grant: SessionNativeRuntimeConversionGrant
): void {
  const retained = nativeRuntimeGrants.get(grant)
  if (retained) {
    retained.phase = 'retired'
    retained.staged = undefined
    retained.signal = undefined
    nativeRuntimeGrants.delete(grant)
  }
}

declare const nativeCompilerSourceGrantBrand: unique symbol
/** Private compile-only authority; runtime conversion grants remain separate. */
export interface SessionNativeCompilerSourceConversionGrant {
  readonly [nativeCompilerSourceGrantBrand]: true
}
interface NativeCompilerSourceGrant {
  issue: NativeIssue
  value: CompiledCoverageSource
  fact: ParentNativeTsConfigFact
  original: NonNullable<ReturnType<typeof nativeSealedFacts.get>>
  signal: AbortSignal | undefined
  staged: Awaited<ReturnType<typeof prepareNativeInputReader>>
  phase: 'prepared' | 'sealing' | 'sealed' | 'failed' | 'retired'
}
const nativeCompilerSourceGrants = new WeakMap<
  SessionNativeCompilerSourceConversionGrant,
  NativeCompilerSourceGrant
>()

function assertNativeCompilerSourceOriginal(
  issue: NativeIssue,
  value: CompiledCoverageSource,
  fact: ParentNativeTsConfigFact,
  original: NativeCompilerSourceGrant['original'],
  signal: AbortSignal
) {
  signal.throwIfAborted()
  assertNativeIssueLive(issue)
  nativeKeys(value, ['version', 'kind', 'source', 'artifact'])
  nativeKeys(value.source, ['file', 'sha256'])
  const artifact = value.artifact
  if (
    ['configurationImports', 'runtimeConfigurationImports'].some((key) =>
      Object.hasOwn(artifact, key)
    )
  )
    nativeFailure('source compilation contains module authority')
  const marker = Object.getOwnPropertyDescriptor(
    artifact,
    'nativeTsConfigInputs'
  )
  if (
    nativeSealedFacts.get(fact) !== original ||
    original.identity !== issue.identity ||
    original.request !== issue.request ||
    original.reference !== issue.reference ||
    original.inventory !== issue.inventory ||
    issue.request.role !== 'compiler-source' ||
    issue.artifact !== artifact ||
    value.version !== 1 ||
    value.kind !== 'next-compiler-source' ||
    !isDeepStrictEqual(value.source, {
      file: issue.request.source.file,
      sha256: issue.request.source.sha256,
    }) ||
    artifact.version !== 2 ||
    artifact.kind !== 'node' ||
    !isDeepStrictEqual(artifact.profile, issue.request.profile) ||
    artifact.entryId !==
      sourceAnalysisEntryId(issue.request.profile, value.source.file) ||
    artifact.entryId !== issue.request.source.id ||
    artifact.sourceHash !== value.source.sha256 ||
    !isDeepStrictEqual(artifact.coverage?.sourceAnalysis, {
      version: 1,
      ...value.source,
    }) ||
    !marker ||
    !('value' in marker) ||
    marker.value !== issue.reference ||
    !isDeepStrictEqual(fact.request, issue.request) ||
    !isDeepStrictEqual(fact.reference, issue.reference) ||
    !isDeepStrictEqual(original.compiler, {
      entryId: artifact.entryId,
      revision: artifact.revision,
      rootDir: artifact.rootDir,
    }) ||
    !isDeepStrictEqual(fact.compiler, original.compiler)
  )
    nativeFailure('source fact lacks its original live emission')
  signal.throwIfAborted()
  assertNativeIssueLive(issue)
}

/** Source preparation never grants runtime or zero-conversion permission. */
export async function prepareSessionNativeCompilerSourceConversion(options: {
  compilation: SessionNativeTsConfigCompilation
  value: CompiledCoverageSource
  fact: ParentNativeTsConfigFact
  selection: NativeTsConfigParentSelection
  signal: AbortSignal
}): Promise<SessionNativeCompilerSourceConversionGrant> {
  nativeKeys(options, ['compilation', 'value', 'fact', 'selection', 'signal'])
  const { compilation, value, fact, signal } = options
  signal.throwIfAborted()
  const issue = nativeCompilations.get(compilation)
  const original = nativeSealedFacts.get(fact)
  if (
    !issue ||
    !original ||
    compilation.role !== 'compiler-source' ||
    compilation.value !== value
  )
    nativeFailure('missing original compiler-source compilation/fact identity')
  const selected = nativeSelection(options.selection, issue.request.profile)
  if (
    !isDeepStrictEqual(selected, {
      version: issue.request.version,
      id: issue.request.id,
      revision: issue.request.revision,
      profile: issue.request.profile,
      source: issue.request.source,
    })
  )
    nativeFailure('foreign compiler-source parent selection')
  const check = () =>
    assertNativeCompilerSourceOriginal(issue, value, fact, original, signal)
  check()
  await assertSealedSessionNativeTsConfigInputs({
    fact,
    expected: { request: issue.request, compiler: original.compiler },
    signal,
  })
  check()
  const staged = await prepareNativeInputReader({
    artifact: issue.artifact,
    reference: issue.reference,
    authorization: issue.authorization,
    signal,
  })
  check()
  if (!staged) nativeFailure('missing compiler-source native preparation')
  const grant =
    createNativeOpaqueIdentity() as SessionNativeCompilerSourceConversionGrant
  nativeCompilerSourceGrants.set(grant, {
    issue,
    value,
    fact,
    original,
    signal,
    staged,
    phase: 'prepared',
  })
  return grant
}

export function assertSessionNativeCompilerSourceConversion(
  grant: SessionNativeCompilerSourceConversionGrant,
  value: CompiledCoverageSource,
  fact: ParentNativeTsConfigFact,
  signal: AbortSignal
): void {
  const retained = nativeCompilerSourceGrants.get(grant)
  if (
    !retained ||
    retained.value !== value ||
    retained.fact !== fact ||
    retained.signal !== signal ||
    retained.phase === 'failed' ||
    retained.phase === 'retired'
  )
    nativeFailure('missing active compiler-source native grant')
  assertNativeCompilerSourceOriginal(
    retained.issue,
    value,
    fact,
    retained.original,
    signal
  )
}

/** Temporary observations never replace or Session-register the original fact. */
export async function sealSessionNativeCompilerSourceConversion(
  grant: SessionNativeCompilerSourceConversionGrant,
  value: CompiledCoverageSource,
  fact: ParentNativeTsConfigFact,
  signal: AbortSignal
): Promise<void> {
  assertSessionNativeCompilerSourceConversion(grant, value, fact, signal)
  const retained = nativeCompilerSourceGrants.get(grant)!
  if (retained.phase !== 'prepared' || !retained.staged)
    nativeFailure('compiler-source native seal already consumed')
  const staged = retained.staged
  retained.staged = undefined
  retained.phase = 'sealing'
  try {
    const observed = await staged.seal()
    assertSessionNativeCompilerSourceConversion(grant, value, fact, signal)
    if (!isDeepStrictEqual(observed, fact))
      nativeFailure(
        'compiler-source native observations differ from original fact'
      )
    retained.phase = 'sealed'
    assertSessionNativeCompilerSourceConversion(grant, value, fact, signal)
  } catch (error) {
    retained.phase = 'failed'
    throw error
  }
}

export function retireSessionNativeCompilerSourceConversion(
  grant: SessionNativeCompilerSourceConversionGrant
): void {
  const retained = nativeCompilerSourceGrants.get(grant)
  if (retained) {
    retained.phase = 'retired'
    retained.staged = undefined
    retained.signal = undefined
    nativeCompilerSourceGrants.delete(grant)
  }
}

/** Paths returned by native emission must remain inside the published closure. */
function artifactPath(root: string, path: string): string {
  const target = resolve(root, path)
  const rel = relative(root, target)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Invalid compiled test artifact path: ${path}`)
  }
  return target
}

/**
 * Owns the native graph and immutable artifacts until dispose. Callers must await
 * all execution processes before disposing the compiler session.
 */
export async function createTestCompilerSession(
  projectDir: string,
  profile: TestProfile,
  options: TestCompilerSessionOptions = {}
) {
  const configuredTestingDefaultConfiguration =
    readTestingDefaultConfiguration(options)
  const configuredCompilerAliases = options.compilerAliases
  const configuredCompilerTransforms = options.compilerTransforms
  const configuredArtifactAllocator = options.allocateArtifact
  if (
    configuredTestingDefaultConfiguration !== undefined &&
    (configuredCompilerAliases !== undefined ||
      configuredCompilerTransforms !== undefined)
  ) {
    throw new Error(
      'ERR_NEXT_TEST_DEFAULT_CONFIGURATION: compiler aliases and transforms are unavailable'
    )
  }
  const privateFactoryUnsupported =
    configuredCompilerAliases !== undefined ||
    configuredCompilerTransforms !== undefined ||
    configuredArtifactAllocator !== undefined
  const importCoverageRequest = options.nativeImportCoverageRoles
  if (
    importCoverageRequest !== undefined &&
    typeof importCoverageRequest !== 'boolean'
  )
    throw new Error('Invalid private native import coverage request')
  const nativeImportCoverageRoles = importCoverageRequest === true
  profile = { ...profile }
  const loaded =
    configuredTestingDefaultConfiguration === undefined
      ? await loadTestCompilerConfig(projectDir, profile)
      : await loadTestCompilerConfig(
          projectDir,
          profile,
          configuredTestingDefaultConfiguration
        )
  const { dir } = loaded
  const config = withCompilerTransforms(
    withCompilerAliases(loaded.config, dir, profile, configuredCompilerAliases),
    dir,
    profile,
    configuredCompilerTransforms
  )
  if (configuredTestingDefaultConfiguration !== undefined) {
    assertTestingDefaultConfigurationEnvironment(
      configuredTestingDefaultConfiguration
    )
  }
  const bindings =
    configuredTestingDefaultConfiguration === undefined
      ? await loadBindings(config.experimental.useWasmBinary)
      : await loadBindings(
          config.experimental.useWasmBinary,
          configuredTestingDefaultConfiguration
        )
  if (bindings.isWasm) {
    throw new Error('Test compilation requires native Turbopack bindings')
  }
  if (
    profile.route !== undefined &&
    (config.cacheComponents || config.output === 'export')
  )
    throw new Error(
      'Route-aware RSC tests currently require dynamic Node rendering without Cache Components or output export'
    )
  const distDir = resolve(dir, config.distDir)
  const dev = profile.mode === 'development'
  // Use the same output lock as normal Next servers/builds, including during
  // config-derived manifest generation. Never allow a second compiler owner.
  if (!config.experimental.lockDistDir) {
    throw new Error('Next test compilation requires experimental.lockDistDir.')
  }
  await mkdir(distDir, { recursive: true })
  const acquiredLock = Lockfile.tryAcquire(join(distDir, 'lock'))
  if (!acquiredLock)
    throw new Error(
      'Next test output is already owned by another compiler or application server.'
    )
  const outputLock = acquiredLock
  const compilation = await (async () => {
    try {
      const buildId = dev
        ? 'development'
        : await generateBuildId(config.generateBuildId, randomUUID)
      const fsChecker = dev
        ? await setupFsCheck({ dir, dev: true, config })
        : {
            rewrites: (await loadCustomRoutes(config)).rewrites,
            previewProps: await generatePreviewKeys({ isBuild: true, distDir }),
          }
      let nativeProjectPaths:
        | Readonly<{ rootPath: string; projectPath: string }>
        | undefined
      const project = dev
        ? await (async () => {
            const result = await createDevTurbopackProject({
              projectPath: dir,
              nextConfig: config,
              distDir,
              fsChecker,
              serverFastRefresh: false,
            })
            nativeProjectPaths = result.nativeProjectPaths
            return result.project
          })()
        : await (async () => {
            const projectOptions = createProductionProjectOptions({
              dir,
              distDir,
              config,
              buildId,
              encryptionKey: await generateEncryptionKeyBase64({
                isBuild: true,
                distDir,
              }),
              previewProps: fsChecker.previewProps,
              rewrites: fsChecker.rewrites,
              clientRouterFilters: undefined,
              ...(configuredTestingDefaultConfiguration === undefined
                ? {}
                : {
                    testingDefaultConfiguration:
                      configuredTestingDefaultConfiguration,
                  }),
            })
            nativeProjectPaths = Object.freeze({
              rootPath: projectOptions.rootPath,
              projectPath: projectOptions.projectPath,
            })
            return bindings.turbo
              .createProject(projectOptions, {
                turbopackMemoryEviction:
                  config.experimental.turbopackMemoryEvictionMode,
                dependencyTracking:
                  config.experimental.turbopackFileSystemCacheForBuild || false,
                gc: config.experimental.turbopackGcOptions,
                isShortSession: true,
              })
              .then((result) => {
                for (const issue of result.issues) printNonFatalIssue(issue)
                return result.value
              })
          })()
      return { buildId, fsChecker, project, nativeProjectPaths }
    } catch (error) {
      await outputLock.unlock()
      throw error
    }
  })()
  const nativeLeaseState: NativeLeaseState = { disposed: false }
  const nativeSignalDetachers = new Set<() => void>()
  const nativeRequestIds = new Set<string>()
  const nativeRequestRevisions = new Set<string>()
  const directories = new Set<string>()
  let closing = false
  let pending: Promise<unknown> = Promise.resolve()
  let disposal: Promise<void> | undefined
  let compilationShutdown: Promise<void> | undefined

  async function compileEntry(
    entry: TestEntry,
    signal: AbortSignal,
    setupFiles: readonly string[],
    setupFilesSequence: 'list' | 'parallel',
    snapshotSerializers: readonly string[],
    coverage: CompileTestOptions['coverage'],
    cohortEntries?: readonly TestEntry[],
    dependencyPlan = false,
    sourceAnalysis?: { file: string; sha256: string; revision: string },
    runtimeConfigurationImports?: CompileTestOptions['runtimeConfigurationImports'],
    nativeContext?: NativeCompileContext
  ) {
    signal.throwIfAborted()
    if (
      configuredCompilerTransforms &&
      (entry.inSource ||
        setupFiles.length ||
        snapshotSerializers.length ||
        coverage ||
        cohortEntries)
    )
      throw new Error(
        'Transform-only compiler plugins cannot yet combine with compiler helpers, setup files, serializers, coverage or shared cohorts.'
      )
    if (dependencyPlan && (profile.environment !== 'node' || cohortEntries))
      throw new Error(
        'Dependency planning currently requires isolated Node entries'
      )
    validateTestProfile(entry.profile)
    if (
      coverage &&
      (coverage.version !== 1 ||
        (profile.browserClient
          ? coverage.kind !== 'browser-v8' || profile.environment !== 'browser'
          : coverage.kind !== 'node-line' || profile.environment !== 'node') ||
        (profile.browserClient && profile.mode !== 'development'))
    ) {
      throw new Error(
        'Coverage requires an explicit Node or development Browser Mode profile'
      )
    }
    if (JSON.stringify(entry.profile) !== JSON.stringify(profile)) {
      throw new Error('Test entry profile does not match its compiler session')
    }
    function projectFile(path: string): string {
      const file = relative(dir, path)
      if (
        !isAbsolute(path) ||
        !file ||
        file === '..' ||
        file.startsWith(`..${sep}`) ||
        isAbsolute(file)
      ) {
        throw new Error(
          'Test entry and setup files must be inside the Next.js project'
        )
      }
      return file.split(sep).join('/')
    }
    const inputs = cohortEntries ?? [entry]
    if (cohortEntries) {
      if (
        !inputs.length ||
        profile.environment !== 'node' ||
        profile.mode !== 'development' ||
        setupFiles.length ||
        snapshotSerializers.length ||
        coverage ||
        new Set(inputs.map((input) => input.id)).size !== inputs.length ||
        new Set(inputs.map((input) => input.file)).size !== inputs.length ||
        inputs.some(
          (input) =>
            input.typecheck ||
            input.inSource ||
            input.executionEnvironment ||
            JSON.stringify(input.profile) !== JSON.stringify(profile)
        )
      ) {
        throw new Error(
          'Shared test cohorts require unique development Node runtime entries without setup, serializers or coverage'
        )
      }
    }
    const cohortInputs = cohortEntries
      ? await Promise.all(
          inputs.map(async (input) => {
            const source = await readFile(input.file)
            if (usesInSourceTestMarker(source.toString('utf8'), input.file)) {
              throw new Error(
                'Shared test cohorts do not yet support import.meta.vitest'
              )
            }
            return {
              entryId: input.id,
              file: projectFile(input.file),
              sourceHash: createHash('sha256').update(source).digest('hex'),
            }
          })
        )
      : undefined
    if (profile.browserClient && (config.basePath || config.assetPrefix))
      throw new Error(
        'Client Browser Mode currently requires the default asset prefix and base path.'
      )
    if (
      profile.browserClient &&
      (setupFilesSequence !== 'list' ||
        (setupFiles.length && coverage) ||
        snapshotSerializers.length ||
        cohortEntries ||
        entry.executionEnvironment ||
        entry.inSource ||
        entry.typecheck)
    )
      throw new Error(
        'Client Browser Mode currently requires one isolated runtime file with list-ordered setup and without setup coverage, serializers or custom realms.'
      )
    const file = projectFile(entry.file)
    const source = await readFile(entry.file)
    if (configuredCompilerTransforms)
      assertTransformSource(source.toString('utf8'), entry.file)
    const sourceHash = createHash('sha256').update(source).digest('hex')
    if (
      runtimeConfigurationImports &&
      (!coverage ||
        sourceAnalysis ||
        cohortEntries ||
        !runtimeConfigurationImports.entry.revision ||
        runtimeConfigurationImports.entry.id !== entry.id ||
        runtimeConfigurationImports.entry.file !== entry.file ||
        runtimeConfigurationImports.entry.sha256 !== sourceHash)
    )
      throw new Error(
        'Runtime configuration proof requires its exact parent runtime entry.'
      )
    if (runtimeConfigurationImports)
      assertConfigurationImportObservation(
        runtimeConfigurationImports.authorization.configFile
      )
    const runtimeConfigurationGraph = runtimeConfigurationImports
      ? await assertConfigurationImportFiles(
          await loaded.configurationImports,
          runtimeConfigurationImports.authorization.configFile,
          signal
        )
      : undefined
    if (
      sourceAnalysis &&
      (sourceAnalysis.file !== entry.file ||
        sourceAnalysis.sha256 !== sourceHash)
    )
      throw new Error('Coverage analysis source changed before compilation')
    const usesInSource =
      entry.inSource ||
      usesInSourceTestMarker(source.toString('utf8'), entry.file)
    if (
      (entry.inSource && entry.inSourceHash !== sourceHash) ||
      (usesInSource &&
        (profile.environment !== 'node' || entry.executionEnvironment))
    ) {
      throw new Error(
        'In-source test discovery does not match the selected Node source bytes'
      )
    }
    const clientSource = profile.browserClient
      ? await realpath(entry.file)
      : undefined
    if (clientSource) {
      const root = await realpath(dir),
        clientRelativePath = relative(root, clientSource)
      if (
        !clientRelativePath ||
        clientRelativePath === '..' ||
        clientRelativePath.startsWith(`..${sep}`) ||
        isAbsolute(clientRelativePath)
      )
        throw new Error(
          'Browser Mode selected source escaped its project root.'
        )
    }
    const setup = setupFiles.map(projectFile)
    const nativeId = createHash('sha256')
      .update(
        cohortInputs
          ? JSON.stringify(
              cohortInputs.map(({ entryId, file: sourceFile }) => ({
                entryId,
                file: sourceFile,
              }))
            )
          : entry.id
      )
      .digest('hex')
    if (
      nativeImportCoverageRoles &&
      (!coverage ||
        profile.environment !== 'node' ||
        profile.browserClient ||
        profile.route !== undefined)
    )
      throw new Error(
        'Native import coverage roles require isolated Node coverage'
      )
    let nativeRequest: NativeTsConfigRequest | undefined
    if (nativeContext) {
      const selected = nativeContext.selection
      if (
        nativeLeaseState.disposed ||
        privateFactoryUnsupported ||
        !coverage ||
        coverage.version !== 1 ||
        coverage.kind !== 'node-line' ||
        cohortEntries ||
        dependencyPlan ||
        setupFiles.length ||
        snapshotSerializers.length ||
        usesInSource ||
        entry.typecheck ||
        entry.executionEnvironment ||
        selected.source.id !== entry.id ||
        selected.source.file !== entry.file ||
        selected.source.sha256 !== sourceHash ||
        !isDeepStrictEqual(selected.profile, profile) ||
        (sourceAnalysis && sourceAnalysis.revision !== selected.revision) ||
        (runtimeConfigurationImports &&
          runtimeConfigurationImports.entry.revision !== selected.revision)
      )
        nativeFailure('private selection or compilation lane differs')
      const paths = compilation.nativeProjectPaths
      if (
        !paths ||
        !isAbsolute(paths.rootPath) ||
        resolve(paths.rootPath) !== paths.rootPath ||
        (await realpath(paths.rootPath)) !== paths.rootPath ||
        (await realpath(dir)) !== dir ||
        resolve(paths.rootPath, paths.projectPath) !== dir ||
        relative(paths.rootPath, dir).split(sep).join('/') !==
          (paths.projectPath === '.' ? '' : paths.projectPath) ||
        (await realpath(entry.file)) !== entry.file
      )
        nativeFailure('actual native project mapping differs')
      signal.throwIfAborted()
      nativeRequest = nativeFreeze({
        version: 1,
        role: nativeContext.role,
        id: selected.id,
        revision: selected.revision,
        profile: nativeCopy(selected.profile),
        source: nativeCopy(selected.source),
        native: {
          entryId: nativeId,
          entryFile: file,
          entryPath: `server/next-test/${nativeId}.js`,
          sourceCoverage: profile.mode === 'production',
          filesystemRoot: { nativePath: '', path: paths.rootPath },
          projectPath: {
            nativePath: paths.projectPath === '.' ? '' : paths.projectPath,
            path: dir,
          },
        },
      })
    }
    const endpoint = await compilation.project.testEntry({
      ...(nativeRequest
        ? { tsconfigInputRevision: nativeRequest.revision }
        : {}),
      ...(nativeImportCoverageRoles ? { importCoverageRoles: true } : {}),
      id: nativeId,
      file,
      ...(cohortInputs
        ? { cohortFiles: cohortInputs.map((input) => input.file) }
        : {}),
      setupFiles: setup,
      setupFilesSequence,
      snapshotSerializers,
      inSource: usesInSource,
      dependencyPlan,
      runtimeEnv: profile.environment === 'node' && dev,
      ...(configuredCompilerAliases
        ? {
            aliasFinds: configuredCompilerAliases.entries.map(
              (mapping) => mapping.find
            ),
          }
        : {}),
      ...(coverage && profile.mode === 'production'
        ? { sourceCoverage: true }
        : {}),
      ...(profile.browserClient
        ? { browserClient: true, browserCoverage: !!coverage }
        : {}),
      environment: profile.environment,
      ...(profile.route !== undefined ? { route: profile.route } : {}),
    })
    signal.throwIfAborted()
    await mkdir(dirname(distDir), { recursive: true })
    const revision =
      nativeRequest?.revision ??
      sourceAnalysis?.revision ??
      runtimeConfigurationImports?.entry.revision ??
      randomUUID()
    const allocation = configuredArtifactAllocator
      ? await Reflect.apply(configuredArtifactAllocator, options, [
          dirname(distDir),
        ])
      : {
          stagingDir: await mkdtemp(
            join(dirname(distDir), '.next-test-pending-')
          ),
          rootDir: join(dirname(distDir), `.next-test-${revision}`),
        }
    const { stagingDir: staging, rootDir } = allocation
    for (const [path, prefix] of [
      [staging, '.next-test-pending-'],
      [rootDir, '.next-test-'],
    ]) {
      if (
        !isAbsolute(path) ||
        dirname(path) !== dirname(distDir) ||
        !basename(path).startsWith(prefix) ||
        !/^\.next-test-[a-zA-Z0-9.-]+$/.test(basename(path))
      ) {
        throw new Error(
          'Test artifact allocation must use generated siblings of the configured output'
        )
      }
    }
    if (staging === rootDir)
      throw new Error('Test staging and publication paths must differ')
    if (
      !(await lstat(staging)).isDirectory() ||
      (await readdir(staging)).length !== 0
    ) {
      throw new Error('Test staging allocation must be an empty directory')
    }
    try {
      await lstat(rootDir)
      throw new Error('Test publication allocation must not already exist')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    // A parent allocator retains deletion ownership until its execution leases
    // close, including when this compiler process crashes or disconnects.
    if (!configuredArtifactAllocator) {
      directories.add(staging)
      directories.add(rootDir)
    }
    let published = false
    try {
      signal.throwIfAborted()
      // Native emission reads one strongly consistent output graph, including
      // client assets and source maps. It never copies mutable build filenames.
      const outputResult = await endpoint.writeToDiskSnapshot(basename(staging))
      const output = outputResult.value
      signal.throwIfAborted()
      const diagnostics = outputResult.issues
        .filter((issue) =>
          ['bug', 'fatal', 'error', 'warning'].includes(issue.severity)
        )
        .map((issue) => ({
          phase: 'compilation' as const,
          severity:
            issue.severity === 'warning'
              ? ('warning' as const)
              : ('error' as const),
          message: formatIssue(issue),
        }))
      if (
        output.type !== 'nodejs' ||
        diagnostics.some((issue) => issue.severity === 'error')
      ) {
        throw new Error(
          diagnostics.map((issue) => issue.message).join('\n') ||
            'No runnable Node.js test artifact was emitted'
        )
      }
      const manifestPage = `/__next_test__/${nativeId}/page`
      const manifests =
        profile.environment === 'rsc'
          ? {
              ...(await writeDevRequestManifests(
                staging,
                compilation.fsChecker.previewProps
              )),
              clientReference: `server/app${manifestPage}_client-reference-manifest.js`,
              serverActions: `server/app${manifestPage}/server-reference-manifest.json`,
              ...(profile.route !== undefined
                ? {
                    routeBuild: `server/app${manifestPage}/build-manifest.json`,
                    routeFont: `server/app${manifestPage}/next-font-manifest.json`,
                    routeLoadable: `server/app${manifestPage}/react-loadable-manifest.json`,
                  }
                : {}),
            }
          : undefined
      const nativeInventory = nativeRequest
        ? nativeFreeze(
            output.serverPaths.map((item) => ({
              path: item.path,
              contentHash: item.contentHash,
            }))
          )
        : undefined
      const files = [
        ...new Set([
          ...output.serverPaths.map((item) => item.path),
          ...output.clientPaths,
          ...(manifests ? [manifests.previewProps, manifests.prerender] : []),
        ]),
      ].sort()
      for (const required of [
        output.entryPath,
        ...Object.values(manifests ?? {}),
      ]) {
        if (!files.includes(required))
          throw new Error(`Missing test artifact: ${required}`)
      }
      for (const outputFile of files) {
        if (!(await lstat(artifactPath(staging, outputFile))).isFile()) {
          throw new Error(
            `Test artifacts require regular emitted files; external package links and directory assets are not supported: ${outputFile}`
          )
        }
      }
      if (usesInSource || profile.browserClient) {
        const sourceMetadataPath = `server/next-test/${nativeId}.source.json`
        if (!files.includes(sourceMetadataPath)) {
          throw new Error('Missing native in-source test source identity')
        }
        const metadata = JSON.parse(
          await readFile(artifactPath(staging, sourceMetadataPath), 'utf8')
        )
        if (metadata.version !== 1 || metadata.sha256 !== sourceHash) {
          throw new Error(
            'Native in-source test bytes do not match marker discovery'
          )
        }
      }
      const clientDescriptor = profile.browserClient
        ? await readClientDescriptor(staging, output.entryPath, files, nativeId)
        : undefined
      let route: (CompiledTestRoute & { metadataPath: string }) | undefined
      if (profile.route !== undefined) {
        const metadataPath = `server/next-test/${nativeId}.route.json`
        if (!files.includes(metadataPath))
          throw new Error('Missing native AppProject test route metadata')
        const metadata: unknown = JSON.parse(
          await readFile(artifactPath(staging, metadataPath), 'utf8')
        )
        validateCompiledTestRoute(metadata, profile)
        if (
          metadata.entry.file !== file ||
          metadata.entry.sha256 !== sourceHash
        )
          throw new Error(
            'Native RSC route entry source identity does not match compilation'
          )
        route = { ...metadata, metadataPath }
      }
      async function validateRouteSources() {
        for (const routeSource of route?.sources ?? []) {
          const path = artifactPath(dir, routeSource.file)
          const canonicalRoot = await realpath(dir)
          const canonicalSource = await realpath(path)
          const sourceRelative = relative(canonicalRoot, canonicalSource)
          if (
            sourceRelative === '..' ||
            sourceRelative.startsWith(`..${sep}`) ||
            isAbsolute(sourceRelative) ||
            createHash('sha256')
              .update(await readFile(path))
              .digest('hex') !== routeSource.sha256
          )
            throw new Error(
              'AppProject route source changed or escaped the project during compilation'
            )
        }
      }
      await validateRouteSources()
      const cohortMetadataPath = `server/next-test/${nativeId}.cohort.json`
      if (cohortInputs) {
        if (!files.includes(cohortMetadataPath)) {
          throw new Error('Missing native shared test cohort metadata')
        }
        const metadata = JSON.parse(
          await readFile(artifactPath(staging, cohortMetadataPath), 'utf8')
        )
        if (
          metadata.cohort?.version !== 1 ||
          JSON.stringify(metadata.cohort.files) !==
            JSON.stringify(cohortInputs.map((input) => input.file))
        ) {
          throw new Error(
            'Compiled shared test cohort order does not match its inputs'
          )
        }
      }
      const mockMetadataPath = `server/next-test/${nativeId}.metadata.json`
      let moduleMocking: CompiledTestArtifact['moduleMocking']
      let moduleCache: { version: 1 } | undefined
      let dynamicModuleMocking: { version: 1; staticMocks?: 1 } | undefined
      if (files.includes(mockMetadataPath)) {
        const nativeMockBytes = await readFile(
          artifactPath(staging, mockMetadataPath)
        )
        const metadata = JSON.parse(nativeMockBytes.toString('utf8'))
        const staticRuntimeMocks =
          metadata.dynamicModuleMocking?.staticMocks === 1
        if (metadata.dynamicModuleMocking !== undefined) {
          if (
            metadata.dynamicModuleMocking?.version !== 1 ||
            metadata.moduleCache?.version !== 1 ||
            (metadata.dynamicModuleMocking.staticMocks !== undefined &&
              !staticRuntimeMocks) ||
            (staticRuntimeMocks
              ? metadata.moduleMocking?.version !== 1 ||
                Object.keys(metadata.moduleMocking).length !== 1
              : metadata.moduleMocking) ||
            profile.environment !== 'node'
          )
            throw new Error(
              'Invalid native runtime module mock ownership metadata'
            )
          dynamicModuleMocking = {
            version: 1,
            ...(staticRuntimeMocks ? { staticMocks: 1 as const } : {}),
          }
        }
        if (metadata.moduleCache !== undefined) {
          if (
            metadata.moduleCache?.version !== 1 ||
            profile.environment !== 'node' ||
            profile.mode !== 'development' ||
            cohortInputs ||
            (metadata.moduleMocking && !staticRuntimeMocks) ||
            setupFiles.length ||
            snapshotSerializers.length ||
            coverage ||
            usesInSource ||
            entry.executionEnvironment
          )
            throw new Error(
              'Module cache resets require isolated development Node without setup, serializers, coverage or custom realms'
            )
          moduleCache = { version: 1 }
          if (staticRuntimeMocks) moduleMocking = { version: 1 }
        } else {
          const productionStaticFactory =
            profile.mode === 'production' &&
            profile.environment === 'node' &&
            metadata.moduleMocking?.productionStaticFactory === 1 &&
            metadata.moduleMocking?.coverage === undefined &&
            metadata.moduleMocking?.cjsNamedSpy === undefined &&
            !profile.route &&
            !setupFiles.length &&
            !snapshotSerializers.length &&
            !cohortInputs &&
            !usesInSource &&
            !entry.executionEnvironment &&
            !coverage
          if (
            !['node', 'rsc'].includes(profile.environment) ||
            (profile.mode !== 'development' && !productionStaticFactory) ||
            (profile.mode !== 'production' &&
              metadata.moduleMocking?.productionStaticFactory !== undefined) ||
            (profile.environment === 'rsc' &&
              (profile.route !== undefined ||
                setupFiles.length ||
                snapshotSerializers.length ||
                entry.executionEnvironment ||
                usesInSource ||
                coverage)) ||
            metadata.moduleMocking?.version !== 1
          )
            throw new Error('Invalid compiled module mocking metadata')
          if (
            metadata.moduleMocking.setupInputs !== undefined &&
            (metadata.moduleMocking.setupInputs !== 1 ||
              profile.environment !== 'node' ||
              profile.mode !== 'development' ||
              !setupFiles.length ||
              cohortInputs ||
              metadata.moduleMocking.cjsNamedSpy !== undefined)
          )
            throw new Error('Invalid compiled setup module mock inputs')
          if (
            metadata.moduleMocking.cjsNamedSpy !== undefined &&
            (metadata.moduleMocking.cjsNamedSpy !== 1 ||
              profile.environment !== 'node' ||
              profile.mode !== 'development' ||
              cohortInputs ||
              setupFiles.length ||
              snapshotSerializers.length ||
              coverage ||
              usesInSource ||
              entry.executionEnvironment)
          )
            throw new Error(
              'CommonJS named-import spies require isolated development Node without setup, serializers, coverage or custom realms'
            )
          let productionSourceMetadata:
            | { path: string; sha256: string }
            | undefined
          if (productionStaticFactory) {
            const path = `server/next-test/${nativeId}.source.json`
            if (!files.includes(path))
              throw new Error(
                'Production static mocks require native source identity'
              )
            const bytes = await readFile(artifactPath(staging, path))
            const nativeSource = JSON.parse(bytes.toString('utf8'))
            if (
              nativeSource.version !== 1 ||
              nativeSource.sha256 !== sourceHash
            )
              throw new Error(
                'Production mock source differs from native compilation'
              )
            productionSourceMetadata = {
              path,
              sha256: createHash('sha256').update(bytes).digest('hex'),
            }
          }
          moduleMocking = {
            version: 1,
            ...(metadata.moduleMocking.setupInputs === 1
              ? { setupInputs: 1 as const }
              : {}),
            ...(metadata.moduleMocking.cjsNamedSpy === 1
              ? { cjsNamedSpy: 1 as const }
              : {}),
            ...(productionStaticFactory
              ? {
                  productionStaticFactory: {
                    version: 1 as const,
                    metadata: {
                      path: mockMetadataPath,
                      sha256: createHash('sha256')
                        .update(nativeMockBytes)
                        .digest('hex'),
                    },
                    sourceMetadata: productionSourceMetadata!,
                    outputs: [],
                  },
                }
              : {}),
            ...(coverage
              ? {
                  coverage: {
                    ...readNativeMockCoverageSources(
                      metadata.moduleMocking.coverage
                    ),
                    nativeMetadata: {
                      path: mockMetadataPath,
                      sha256: createHash('sha256')
                        .update(nativeMockBytes)
                        .digest('hex'),
                    },
                  },
                }
              : {}),
          }
        }
      }
      // As in the dev server output directory, emitted Node chunks are CJS even
      // when the application's package.json declares type: module.
      if (!files.includes('package.json')) {
        await writeFile(join(staging, 'package.json'), '{"type":"commonjs"}')
        files.push('package.json')
        files.sort()
      }
      if (
        configuredCompilerTransforms &&
        (moduleMocking || moduleCache || dynamicModuleMocking)
      )
        throw new Error(
          'Transform-only compiler plugins cannot yet combine with module mock or cache compiler helpers.'
        )
      if (coverage && profile.mode === 'production' && moduleMocking)
        throw new Error(
          'Production source coverage does not yet support module mocks.'
        )
      const importRoles = nativeImportCoverageRoles
        ? await readImportCoverageProof(
            staging,
            output.entryPath,
            files,
            profile.mode
          )
        : undefined
      const sourcePreservation =
        coverage && profile.mode === 'production'
          ? await readSourceCoverageProof(staging, output.entryPath, files)
          : undefined
      const coverageMetadata = coverage
        ? await (
            profile.browserClient
              ? buildBrowserCoverageMetadata
              : buildCoverageMetadata
          )({
            entryPath: output.entryPath,
            rootDir: staging,
            files,
            projectDir: dir,
            sourceRootDir: resolve(
              config.turbopack?.root || config.outputFileTracingRoot || dir
            ),
            entryFile: entry.file,
            includeEntrySource: !!sourceAnalysis,
            setupFiles,
            syntheticSources: moduleMocking?.coverage,
          })
        : undefined
      signal.throwIfAborted()
      const publishedSourceHash = createHash('sha256')
        .update(await readFile(entry.file))
        .digest('hex')
      if (publishedSourceHash !== sourceHash) {
        throw new Error('Test source changed while its artifact was compiled')
      }
      if (cohortInputs) {
        for (let index = 0; index < inputs.length; index++) {
          const publishedHash = createHash('sha256')
            .update(await readFile(inputs[index].file))
            .digest('hex')
          if (publishedHash !== cohortInputs[index].sourceHash) {
            throw new Error(
              'Shared test cohort source changed while its artifact was compiled'
            )
          }
        }
      }
      if (moduleMocking?.productionStaticFactory) {
        moduleMocking.productionStaticFactory.outputs = await Promise.all(
          files.map(async (path) => ({
            path,
            sha256: createHash('sha256')
              .update(await readFile(artifactPath(staging, path)))
              .digest('hex'),
          }))
        )
      }
      const cohortOutputs = cohortInputs
        ? await Promise.all(
            files.map(async (outputFile) => ({
              path: outputFile,
              sha256: createHash('sha256')
                .update(await readFile(artifactPath(staging, outputFile)))
                .digest('hex'),
            }))
          )
        : undefined
      await validateRouteSources()
      const client = clientDescriptor
        ? {
            ...clientDescriptor,
            sourceFile: clientSource!,
            outputs: await hashClientOutputs(staging, files),
          }
        : undefined
      await rename(staging, rootDir)
      published = true
      directories.delete(staging)
      if (!configuredArtifactAllocator) directories.add(rootDir)
      await materializeExternalLayout(rootDir, files, nativeId)
      const sourceDependencies = dependencyPlan
        ? await readSourceDependencyAsset(
            rootDir,
            output.entryPath,
            dir,
            entry,
            sourceHash
          )
        : undefined
      if (
        sourceDependencies &&
        (Object.keys(config.turbopack.rules ?? {}).length ||
          config.experimental.swcPlugins?.length)
      )
        sourceDependencies.complete = false
      const common = {
        ...(sourceDependencies ? { sourceDependencies } : {}),
        version: 2 as const,
        ...(coverageMetadata
          ? {
              coverage: {
                ...coverageMetadata,
                ...(sourceAnalysis
                  ? {
                      sourceAnalysis: {
                        version: 1 as const,
                        file: sourceAnalysis.file,
                        sha256: sourceAnalysis.sha256,
                      },
                    }
                  : {}),
                ...(sourcePreservation ? { sourcePreservation } : {}),
                ...(importRoles ? { importRoles } : {}),
              },
            }
          : {}),
        entryId: entry.id,
        setupFiles: [...setupFiles],
        snapshotSerializers: [...snapshotSerializers],
        ...(moduleMocking ? { moduleMocking } : {}),
        ...(moduleCache ? { moduleCache } : {}),
        ...(dynamicModuleMocking ? { dynamicModuleMocking } : {}),
        revision,
        sourceHash,
        rootDir,
        entryPath: output.entryPath,
        files,
        dependencyEvidence: {
          kind: 'emitted-output' as const,
          complete: false as const,
          serverOutputs: output.serverPaths.map(({ path, contentHash }) => ({
            path,
            contentHash,
          })),
        },
        diagnostics,
      }
      const artifact: CompiledTestArtifact = client
        ? {
            ...common,
            kind: 'browser',
            profile: { ...profile, environment: 'browser' },
            client,
          }
        : profile.environment === 'rsc'
          ? {
              ...common,
              kind: 'rsc',
              profile: { ...profile, environment: 'rsc' },
              manifestPage,
              ...(route ? { route } : {}),
              manifests: manifests!,
              requestContext: {
                mode: profile.mode,
                buildId: compilation.buildId,
                deploymentId: config.deploymentId ?? '',
                incrementalCache: {
                  cacheMaxMemorySize: config.cacheMaxMemorySize,
                  allowedRevalidateHeaderKeys:
                    config.experimental.allowedRevalidateHeaderKeys,
                  fetchCacheKeyPrefix: config.experimental.fetchCacheKeyPrefix,
                  isrFlushToDisk: Boolean(config.experimental.isrFlushToDisk),
                  customHandlersConfigured: Boolean(
                    config.cacheHandler ||
                      Object.values(config.cacheHandlers ?? {}).some(Boolean)
                  ),
                },
                renderOpts: {
                  cacheLifeProfiles: config.cacheLife,
                  staticPageGenerationTimeout:
                    config.staticPageGenerationTimeout,
                  cacheComponents: config.cacheComponents ?? false,
                  validationLevel:
                    config.experimental.instantInsights.validationLevel,
                  assetPrefix: config.assetPrefix,
                  experimental: {
                    authInterrupts: !!config.experimental.authInterrupts,
                    useCacheTimeout: config.experimental.useCacheTimeout,
                    durableUseCacheEntries: Boolean(
                      config.experimental.durableUseCacheEntries
                    ),
                  },
                },
                ...(route
                  ? {
                      routeRenderOpts: createCompiledRouteRenderOpts(
                        config,
                        profile.mode
                      ),
                    }
                  : {}),
              },
            }
          : {
              ...common,
              kind: 'node',
              ...(cohortInputs
                ? {
                    cohort: {
                      version: 1 as const,
                      index: 0,
                      metadataPath: cohortMetadataPath,
                      outputs: cohortOutputs!,
                      entries: cohortInputs,
                    },
                  }
                : {}),
              profile: { ...profile, environment: profile.environment },
              ...(profile.environment === 'browser'
                ? {
                    applicationServer: {
                      mode: profile.mode,
                      distDir,
                      lockDistDir: Boolean(config.experimental.lockDistDir),
                    },
                  }
                : {}),
            }
      if (runtimeConfigurationImports && runtimeConfigurationGraph) {
        assertConfigurationImportObservation(
          runtimeConfigurationImports.authorization.configFile
        )
        artifact.runtimeConfigurationImports =
          await writeRuntimeConfigurationImportProof(
            artifact,
            runtimeConfigurationImports.authorization,
            runtimeConfigurationImports.entry,
            runtimeConfigurationGraph,
            signal
          )
        assertConfigurationImportObservation(
          runtimeConfigurationImports.authorization.configFile
        )
      }
      signal.throwIfAborted()
      if (nativeRequest && nativeContext && nativeInventory) {
        signal.throwIfAborted()
        const expectedPath = nativeRequest.native.entryPath.replace(
          /\.js$/,
          '.tsconfig-inputs.json'
        )
        const matching = nativeInventory.filter(
          (item) => item.path === expectedPath
        )
        if (
          nativeLeaseState.disposed ||
          artifact.kind !== 'node' ||
          output.clientPaths.length ||
          new Set(nativeInventory.map((item) => item.path)).size !==
            nativeInventory.length ||
          matching.length !== 1 ||
          !files.includes(matching[0].path) ||
          artifact.moduleMocking ||
          artifact.moduleCache ||
          artifact.dynamicModuleMocking ||
          artifact.cohort ||
          (nativeContext.role === 'compiler-source'
            ? !sourceAnalysis
            : !!sourceAnalysis) ||
          (await realpath(rootDir)) !== rootDir ||
          !(await lstat(artifactPath(rootDir, expectedPath))).isFile() ||
          (await realpath(artifactPath(rootDir, expectedPath))) !==
            artifactPath(rootDir, expectedPath)
        )
          nativeFailure('missing original native snapshot allocation/inventory')
        const nativeHash = matching[0].contentHash
        const decodedHash =
          typeof nativeHash === 'string'
            ? Buffer.from(nativeHash, 'base64')
            : Buffer.alloc(0)
        if (
          decodedHash.length !== 32 ||
          decodedHash.toString('base64') !== nativeHash
        )
          nativeFailure(
            'native sidecar requires canonical SHA256 Base64 output hash'
          )
        const nativeBytes = await readFirstNativeSidecar(
          rootDir,
          matching[0].path,
          nativeLeaseState,
          signal
        )
        if (
          createHash('sha256').update(nativeBytes).digest('base64') !==
          nativeHash
        )
          nativeFailure('native sidecar differs from the actual emitted asset')
        const reference = nativeFreeze({
          version: 1 as const,
          nativeMetadata: {
            path: matching[0].path,
            sha256: createHash('sha256').update(nativeBytes).digest('hex'),
          },
        })
        signal.throwIfAborted()
        if (nativeLeaseState.disposed)
          nativeFailure('original allocation lease is closed')
        Object.defineProperty(artifact, 'nativeTsConfigInputs', {
          value: reference,
          enumerable: true,
          writable: true,
          configurable: true,
        })
        nativeContext.emission = {
          artifact,
          request: nativeRequest,
          reference,
          inventory: nativeInventory,
        }
      }
      return artifact
    } catch (error) {
      if (!configuredArtifactAllocator) {
        await rm(staging, { recursive: true, force: true })
        directories.delete(staging)
        if (published) {
          await rm(rootDir, { recursive: true, force: true })
          directories.delete(rootDir)
        }
      }
      throw error
    }
  }

  // Release native watches/cache handles before another owner starts the normal
  // application server. Published revisions remain leased until dispose().
  function shutdownCompilation(): Promise<void> {
    closing = true
    return (compilationShutdown ??= (async () => {
      await pending
      await compilation.project.shutdown()
      // Failed native shutdown retains the lock until process exit.
      await outputLock.unlock()
    })())
  }

  function compileCoverageSourceOperation(
    source: { file: string; sha256: string },
    {
      signal,
      revision,
      configurationImports,
    }: {
      signal: AbortSignal
      revision: string
      configurationImports?: ConfigurationImportAuthorization
    },
    nativeContext?: NativeCompileContext
  ): Promise<CompiledCoverageSource> {
    if (closing)
      return Promise.reject(new Error('Test compilation has been shut down'))
    const selected = { ...source }
    const result = pending.then(async () => {
      signal.throwIfAborted()
      if (
        !revision ||
        profile.environment !== 'node' ||
        profile.browserClient ||
        profile.route !== undefined ||
        (!/\.[cm]?ts$/.test(selected.file) &&
          !(
            nativeImportCoverageRoles === true &&
            /\.[jt]sx$/.test(selected.file)
          )) ||
        /\.d\.(?:[cm]?ts|tsx)$/.test(selected.file) ||
        /\.(?:test|spec)\.(?:[cm]?ts|[jt]sx)$/.test(selected.file) ||
        !/^[a-f0-9]{64}$/.test(selected.sha256) ||
        (await realpath(selected.file)) !== selected.file
      )
        throw new Error(
          'Coverage source analysis requires a canonical TypeScript source and a Node compiler profile'
        )
      if (configurationImports)
        assertConfigurationImportObservation(configurationImports.configFile)
      const configurationGraph = configurationImports
        ? await assertConfigurationImportFiles(
            await loaded.configurationImports,
            configurationImports.configFile,
            signal
          )
        : undefined
      const artifact = await compileEntry(
        {
          id: sourceAnalysisEntryId(profile, selected.file),
          file: selected.file,
          profile,
        },
        signal,
        [],
        'list',
        [],
        { version: 1, kind: 'node-line' },
        undefined,
        false,
        { ...selected, revision },
        undefined,
        nativeContext
      )
      const configurationProof =
        configurationImports && configurationGraph
          ? await writeConfigurationImportProof(
              artifact,
              configurationImports,
              configurationGraph,
              signal
            )
          : undefined
      signal.throwIfAborted()
      if (configurationImports)
        assertConfigurationImportObservation(configurationImports.configFile)
      return {
        version: 1 as const,
        kind: 'next-compiler-source' as const,
        ...(configurationProof
          ? { configurationImports: configurationProof }
          : {}),
        source: selected,
        artifact,
      }
    })
    pending = result.catch(() => {})
    return result
  }

  function newNativeCompileContext(
    role: NativeRole,
    selection: NativeTsConfigParentSelection,
    signal: AbortSignal
  ): NativeCompileContext {
    if (closing || nativeLeaseState.disposed)
      nativeFailure('Session compilation has been shut down')
    if (privateFactoryUnsupported)
      nativeFailure(
        'private issuer requires the original default Session allocation'
      )
    const selected = nativeSelection(selection, profile)
    if (
      nativeRequestIds.has(selected.id) ||
      nativeRequestRevisions.has(selected.revision)
    )
      nativeFailure('private request identity already consumed')
    nativeRequestIds.add(selected.id)
    nativeRequestRevisions.add(selected.revision)
    const operation = trackNativeOperation(signal)
    nativeSignalDetachers.add(operation.detach)
    return { role, selection: selected, operation: operation.state }
  }

  return {
    /** Actual source selected by the ordinary Next configuration loader. */
    ...(config.configFile ? { configurationFile: config.configFile } : {}),
    compile(
      entry: TestEntry,
      {
        signal,
        setupFiles = [],
        setupFilesSequence = 'list',
        snapshotSerializers = [],
        coverage,
        dependencyPlan,
        runtimeConfigurationImports,
      }: CompileTestOptions
    ) {
      if (closing)
        return Promise.reject(new Error('Test compilation has been shut down'))
      const setup = [...setupFiles]
      const runtime = runtimeConfigurationImports
        ? structuredClone(runtimeConfigurationImports)
        : undefined
      const result = pending.then(() =>
        compileEntry(
          entry,
          signal,
          setup,
          setupFilesSequence,
          [...snapshotSerializers],
          coverage,
          undefined,
          dependencyPlan,
          undefined,
          runtime
        )
      )
      pending = result.catch(() => {})
      return result
    },
    /** Compile exact source bytes in this effective profile; no source evaluation. */
    compileCoverageSource(
      source: { file: string; sha256: string },
      {
        signal,
        revision,
        configurationImports,
      }: {
        signal: AbortSignal
        revision: string
        configurationImports?: ConfigurationImportAuthorization
      }
    ): Promise<CompiledCoverageSource> {
      return compileCoverageSourceOperation(source, {
        signal,
        revision,
        configurationImports,
      })
    },
    /** Private actual runtime compilation; its authority stays in this process. */
    async compileRuntimeWithNativeTsConfigInputs(
      entry: TestEntry,
      args: {
        selection: NativeTsConfigParentSelection
        signal: AbortSignal
        coverage: { version: 1; kind: 'node-line' }
        runtimeConfigurationImports?: CompileTestOptions['runtimeConfigurationImports']
      }
    ): Promise<SessionNativeTsConfigCompilation> {
      nativeKeys(
        args,
        Object.hasOwn(args, 'runtimeConfigurationImports')
          ? ['selection', 'signal', 'coverage', 'runtimeConfigurationImports']
          : ['selection', 'signal', 'coverage']
      )
      nativeKeys(args.coverage, ['version', 'kind'])
      nativeKeys(entry, ['id', 'file', 'profile'])
      const signal = args.signal
      const context = newNativeCompileContext('runtime', args.selection, signal)
      if (
        entry.id !== context.selection.source.id ||
        entry.file !== context.selection.source.file ||
        !isDeepStrictEqual(entry.profile, context.selection.profile)
      )
        nativeFailure('foreign runtime entry')
      const selected = nativeFreeze(nativeCopy(entry))
      const coverage = nativeFreeze(nativeCopy(args.coverage))
      const runtime = args.runtimeConfigurationImports
        ? nativeFreeze(nativeCopy(args.runtimeConfigurationImports))
        : undefined
      const result = pending.then(async () => {
        const artifact = await compileEntry(
          selected,
          signal,
          [],
          'list',
          [],
          coverage,
          undefined,
          false,
          undefined,
          runtime,
          context
        )
        return issueNativeCompilation(
          nativeLeaseState,
          context,
          artifact as CompiledNodeTestArtifact,
          signal
        )
      })
      pending = result.catch(() => {})
      return result
    },
    /** Private actual compile-only operation; it never evaluates the source. */
    async compileCoverageSourceWithNativeTsConfigInputs(
      source: { file: string; sha256: string },
      args: {
        selection: NativeTsConfigParentSelection
        signal: AbortSignal
        configurationImports?: ConfigurationImportAuthorization
      }
    ): Promise<SessionNativeTsConfigCompilation> {
      nativeKeys(
        args,
        Object.hasOwn(args, 'configurationImports')
          ? ['selection', 'signal', 'configurationImports']
          : ['selection', 'signal']
      )
      const signal = args.signal
      const context = newNativeCompileContext(
        'compiler-source',
        args.selection,
        signal
      )
      nativeKeys(source, ['file', 'sha256'])
      if (
        context.selection.source.id !==
          sourceAnalysisEntryId(profile, source.file) ||
        context.selection.source.file !== source.file ||
        context.selection.source.sha256 !== source.sha256
      )
        nativeFailure('foreign compiler-source selection')
      const selected = nativeFreeze(nativeCopy(source))
      const configurationImports = args.configurationImports
        ? nativeFreeze(nativeCopy(args.configurationImports))
        : undefined
      const result = compileCoverageSourceOperation(
        selected,
        {
          signal,
          revision: context.selection.revision,
          configurationImports,
        },
        context
      ).then((value) =>
        issueNativeCompilation(nativeLeaseState, context, value, signal)
      )
      pending = result.catch(() => {})
      return result
    },
    /** Only an original wrapper issued by this Session can stage actual origin. */
    async prepareNativeTsConfigInputs(
      issuedCompilation: SessionNativeTsConfigCompilation,
      args: {
        role: NativeRole
        selection: NativeTsConfigParentSelection
        signal: AbortSignal
      }
    ) {
      nativeKeys(args, ['role', 'selection', 'signal'])
      const issue = nativeCompilations.get(issuedCompilation)
      const selected = nativeSelection(args.selection, profile)
      if (
        !issue ||
        issue.state !== nativeLeaseState ||
        args.role !== issuedCompilation.role ||
        !isDeepStrictEqual(selected, {
          version: issue.request.version,
          id: issue.request.id,
          revision: issue.request.revision,
          profile: issue.request.profile,
          source: issue.request.source,
        })
      )
        nativeFailure('missing original Session compilation identity')
      return prepareIssuedNativeCompilation(issue, args.signal)
    },
    compileCohort(
      entries: readonly TestEntry[],
      {
        signal,
        setupFiles = [],
        setupFilesSequence = 'list',
        snapshotSerializers = [],
        coverage,
        runtimeConfigurationImports,
      }: CompileTestOptions
    ): Promise<CompiledTestCohort> {
      if (runtimeConfigurationImports)
        return Promise.reject(
          new Error('Runtime config receipts require isolated entries.')
        )
      if (closing)
        return Promise.reject(new Error('Test compilation has been shut down'))
      const inputs = entries.map((entry) => ({
        ...entry,
        profile: { ...entry.profile },
      }))
      const setup = [...setupFiles]
      const serializers = [...snapshotSerializers]
      const result = pending.then(async () => {
        if (!inputs.length)
          throw new Error('A shared test cohort requires at least one entry')
        const artifact = await compileEntry(
          inputs[0],
          signal,
          setup,
          setupFilesSequence,
          serializers,
          coverage,
          inputs
        )
        if (artifact.kind !== 'node' || !artifact.cohort) {
          throw new Error(
            'Shared test cohort compilation did not produce Node cohort identity'
          )
        }
        const cohort = artifact.cohort
        return {
          version: 1 as const,
          artifacts: cohort.entries.map(
            (input, index): CompiledNodeTestArtifact => ({
              ...artifact,
              entryId: input.entryId,
              sourceHash: input.sourceHash,
              cohort: { ...cohort, index },
            })
          ),
        }
      })
      pending = result.catch(() => {})
      return result
    },
    shutdownCompilation,
    dispose(): Promise<void> {
      nativeLeaseState.disposed = true
      for (const detach of nativeSignalDetachers) detach()
      nativeSignalDetachers.clear()
      if (!disposal) {
        disposal = (async () => {
          try {
            await shutdownCompilation()
          } finally {
            await Promise.all(
              [...directories].map((path) =>
                rm(path, { recursive: true, force: true })
              )
            )
            directories.clear()
          }
        })()
      }
      return disposal
    },
  }
}
