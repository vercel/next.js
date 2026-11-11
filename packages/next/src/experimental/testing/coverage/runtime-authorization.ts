import { lstat, readFile, realpath } from 'fs/promises'
import { isDeepStrictEqual } from 'util'
import type {
  CompiledTestArtifact,
  TestCoverageCompletion,
  TestEntry,
} from '../contracts'
import { assertCoverageCompletion } from '../execution/coverage'
import {
  buildCoverageMetadata,
  coverageHash,
  readArtifactFile,
  within,
} from './artifact'
import { verifyImportCoverageArtifact } from './import-roles'
import { verifySourceCoverageArtifact } from './source-profile'
import type {
  NativeTsConfigParentSelection,
  SessionNativeTsConfigCompilation,
  SessionNativeRuntimeConversionGrant,
} from '../compiler'
import type { ParentNativeTsConfigFact } from './native-tsconfig-inputs'

/** Retained by the parent; this capability never enters compiler or worker IPC. */
export interface CoverageRuntimeAuthorization {
  projectDir: string
  artifactRoot: string
  revision: string
  runId: string
  entry: Pick<TestEntry, 'id' | 'file' | 'profile'>
  entrySha256: string
  selectedSources: readonly { file: string; sha256: string }[]
  /** Asserts both native v1 negotiations, the closed capture owner and live lease. */
  runtimeJSX: { version: 1; assertLease(): void }
}

/** Copy data and descriptors without invoking an accessor or dropping a prototype. */
function snapshotData(value: unknown, omitRuntimeCapability = false): any {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function')
      throw new Error('Non-data runtime coverage authority')
    return value
  }
  const prototype = Object.getPrototypeOf(value)
  if (
    prototype !== Object.prototype &&
    prototype !== null &&
    prototype !== Array.prototype
  )
    throw new Error('Unsupported runtime coverage authority prototype')
  const result = Array.isArray(value) ? [] : Object.create(prototype)
  for (const key of Reflect.ownKeys(value)) {
    if (omitRuntimeCapability && key === 'runtimeJSX') continue
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (!Object.hasOwn(descriptor, 'value'))
      throw new Error('Accessor in runtime coverage authority')
    Object.defineProperty(result, key, {
      ...descriptor,
      value: snapshotData(descriptor.value),
    })
  }
  return result
}

function sameDescriptor(
  actual: PropertyDescriptor | undefined,
  retained: PropertyDescriptor
): boolean {
  return (
    !!actual &&
    ['value', 'get', 'set', 'writable', 'enumerable', 'configurable'].every(
      (key) =>
        Object.hasOwn(actual, key) === Object.hasOwn(retained, key) &&
        Object.is(
          actual[key as keyof PropertyDescriptor],
          retained[key as keyof PropertyDescriptor]
        )
    )
  )
}

/** Unlike ordinary object equality, include every own descriptor and non-enumerable value. */
function sameData(
  actual: any,
  retained: any,
  omitRuntimeCapability = false
): boolean {
  if (
    actual === null ||
    retained === null ||
    typeof actual !== 'object' ||
    typeof retained !== 'object'
  )
    return Object.is(actual, retained)
  if (Object.getPrototypeOf(actual) !== Object.getPrototypeOf(retained))
    return false
  const keys = Reflect.ownKeys(actual).filter(
    (key) => !omitRuntimeCapability || key !== 'runtimeJSX'
  )
  const retainedKeys = Reflect.ownKeys(retained)
  if (
    keys.length !== retainedKeys.length ||
    keys.some((key, index) => key !== retainedKeys[index])
  )
    return false
  return keys.every((key) => {
    const left = Object.getOwnPropertyDescriptor(actual, key)!,
      right = Object.getOwnPropertyDescriptor(retained, key)!
    return (
      Object.hasOwn(left, 'value') &&
      Object.hasOwn(right, 'value') &&
      left.enumerable === right.enumerable &&
      left.configurable === right.configurable &&
      left.writable === right.writable &&
      sameData(left.value, right.value)
    )
  })
}

/** Snapshot before the first await; later reads cannot replace the parent authority. */
export function retainRuntimeCoverageAuthorization(
  artifact: CompiledTestArtifact,
  completion: TestCoverageCompletion,
  expected: CoverageRuntimeAuthorization,
  signal: AbortSignal
): {
  artifact: CompiledTestArtifact
  completion: TestCoverageCompletion
  expected: CoverageRuntimeAuthorization
} {
  signal.throwIfAborted()
  // Parent accessors are evaluated once. Descriptor comparisons below never call
  // this getter again and reject replacement of either the getter or data value.
  const requested = Object.getOwnPropertyDescriptor(expected, 'runtimeJSX')
  const retained = snapshotData(expected, true)
  const artifactSnapshot = snapshotData(artifact)
  const completionSnapshot = snapshotData(completion)
  const capability = expected.runtimeJSX
  if (
    !requested ||
    !capability ||
    typeof capability !== 'object' ||
    Array.isArray(capability)
  )
    throw new Error('Invalid private runtime JSX authorization')
  const capabilityPrototype = Object.getPrototypeOf(capability)
  const version = Object.getOwnPropertyDescriptor(capability, 'version')
  const callback = Object.getOwnPropertyDescriptor(capability, 'assertLease')
  if (
    Reflect.ownKeys(capability).length !== 2 ||
    !version ||
    !callback ||
    !Object.hasOwn(version, 'value') ||
    !Object.hasOwn(callback, 'value') ||
    version.value !== 1 ||
    typeof callback.value !== 'function'
  )
    throw new Error('Invalid private runtime JSX authorization')
  function assertUnchanged() {
    signal.throwIfAborted()
    if (
      !sameDescriptor(
        Object.getOwnPropertyDescriptor(expected, 'runtimeJSX'),
        requested!
      ) ||
      Object.getPrototypeOf(capability) !== capabilityPrototype ||
      Reflect.ownKeys(capability).length !== 2 ||
      !sameDescriptor(
        Object.getOwnPropertyDescriptor(capability, 'version'),
        version!
      ) ||
      !sameDescriptor(
        Object.getOwnPropertyDescriptor(capability, 'assertLease'),
        callback!
      ) ||
      !sameData(expected, retained, true) ||
      !sameData(artifact, artifactSnapshot) ||
      !sameData(completion, completionSnapshot)
    )
      throw new Error(
        'Parent runtime coverage authorization changed during conversion'
      )
  }
  return {
    artifact: artifactSnapshot,
    completion: completionSnapshot,
    expected: Object.assign(snapshotData(retained), {
      runtimeJSX: Object.freeze({
        version: 1 as const,
        assertLease() {
          assertUnchanged()
          if (Reflect.apply(callback.value, capability, []) !== undefined)
            throw new Error(
              'Private runtime JSX lease must return synchronously with undefined'
            )
          assertUnchanged()
        },
      }),
    }),
  }
}

/** Native authority is separate from runtimeJSX and never enters IPC. */
export interface RuntimeNativeInputsAuthorization {
  compilation: SessionNativeTsConfigCompilation
  fact: ParentNativeTsConfigFact
  selection: NativeTsConfigParentSelection
}
type RetainedRuntimeCoverage = ReturnType<
  typeof retainRuntimeCoverageAuthorization
>
type NativeCompiler = typeof import('../compiler/index.js')
interface NativeRuntimeBinding {
  retained: RetainedRuntimeCoverage
  artifact: CompiledTestArtifact
  authority: RuntimeNativeInputsAuthorization
  prototype: object | null
  descriptors: PropertyDescriptor[]
  selection: NativeTsConfigParentSelection
  compiler: NativeCompiler
  methods: Pick<
    NativeCompiler,
    | 'prepareSessionNativeRuntimeConversion'
    | 'assertSessionNativeRuntimeConversion'
    | 'sealSessionNativeRuntimeConversion'
    | 'retireSessionNativeRuntimeConversion'
  >
  grant: SessionNativeRuntimeConversionGrant
  signal: AbortSignal
  phase: 'prepared' | 'sealing' | 'sealed' | 'retired'
}
const nativeRuntimeBindings = new WeakMap<
  CompiledTestArtifact,
  NativeRuntimeBinding
>()
const nativeAuthorityKeys = ['compilation', 'fact', 'selection'] as const
function assertNativeAuthorityData(
  binding: Pick<
    NativeRuntimeBinding,
    'authority' | 'prototype' | 'descriptors' | 'selection'
  >
) {
  if (
    Object.getPrototypeOf(binding.authority) !== binding.prototype ||
    Reflect.ownKeys(binding.authority).length !== 3 ||
    !nativeAuthorityKeys.every((key, index) =>
      sameDescriptor(
        Object.getOwnPropertyDescriptor(binding.authority, key),
        binding.descriptors[index]
      )
    ) ||
    !sameData(binding.descriptors[2].value, binding.selection)
  )
    throw new Error('Parent native runtime authority changed during conversion')
}
function assertNativeBinding(binding: NativeRuntimeBinding) {
  binding.signal.throwIfAborted()
  if (
    nativeRuntimeBindings.get(binding.retained.artifact) !== binding ||
    binding.phase === 'retired'
  )
    throw new Error('Missing exact retained native runtime authority')
  const check = () => {
    assertNativeAuthorityData(binding)
    for (const key of Object.keys(
      binding.methods
    ) as (keyof NativeRuntimeBinding['methods'])[])
      if (binding.compiler[key] !== binding.methods[key])
        throw new Error('Compiler native grant operations changed')
    binding.methods.assertSessionNativeRuntimeConversion(
      binding.grant,
      binding.artifact,
      binding.descriptors[1].value,
      binding.signal
    )
    binding.signal.throwIfAborted()
  }
  check()
  binding.retained.expected.runtimeJSX.assertLease()
  check()
}
/** Retain before import awaits; only genuine issuance can bind this exact copy. */
export async function retainNativeRuntimeCoverageAuthorization(
  artifact: CompiledTestArtifact,
  completion: TestCoverageCompletion,
  expected: CoverageRuntimeAuthorization,
  authority: RuntimeNativeInputsAuthorization,
  signal: AbortSignal
): Promise<RetainedRuntimeCoverage> {
  signal.throwIfAborted()
  if (!Object.hasOwn(artifact, 'nativeTsConfigInputs'))
    throw new Error(
      'Private native runtime coverage requires its original marker'
    )
  if (
    !authority ||
    typeof authority !== 'object' ||
    Array.isArray(authority) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(authority)) ||
    Reflect.ownKeys(authority).length !== 3
  )
    throw new Error('Invalid private native runtime authority')
  const descriptors = nativeAuthorityKeys.map((key) =>
    Object.getOwnPropertyDescriptor(authority, key)
  )
  if (
    descriptors.some(
      (value) => !value || !Object.hasOwn(value, 'value') || !value.enumerable
    )
  )
    throw new Error('Invalid private native runtime authority')
  const retained = retainRuntimeCoverageAuthorization(
    artifact,
    completion,
    expected,
    signal
  )
  const captured = {
    authority,
    prototype: Object.getPrototypeOf(authority),
    descriptors: descriptors as PropertyDescriptor[],
    selection: snapshotData(
      descriptors[2]!.value
    ) as NativeTsConfigParentSelection,
  }
  assertNativeAuthorityData(captured)
  const selection = captured.selection
  if (
    !selection ||
    selection.version !== 1 ||
    selection.revision !== retained.expected.revision ||
    !isDeepStrictEqual(selection.profile, retained.expected.entry.profile) ||
    !isDeepStrictEqual(selection.source, {
      id: retained.expected.entry.id,
      file: retained.expected.entry.file,
      sha256: retained.expected.entrySha256,
    })
  )
    throw new Error('Native runtime selection differs from parent coverage')
  retained.expected.runtimeJSX.assertLease()
  // Defer the CommonJS lookup past the compiler/source-analysis initialization cycle.
  const compiler: NativeCompiler = await Promise.resolve().then(
    () =>
      require('../compiler/index.js') as typeof import('../compiler/index.js')
  )
  signal.throwIfAborted()
  assertNativeAuthorityData(captured)
  retained.expected.runtimeJSX.assertLease()
  const methods: NativeRuntimeBinding['methods'] = {
    prepareSessionNativeRuntimeConversion:
      compiler.prepareSessionNativeRuntimeConversion,
    assertSessionNativeRuntimeConversion:
      compiler.assertSessionNativeRuntimeConversion,
    sealSessionNativeRuntimeConversion:
      compiler.sealSessionNativeRuntimeConversion,
    retireSessionNativeRuntimeConversion:
      compiler.retireSessionNativeRuntimeConversion,
  }
  let grant: SessionNativeRuntimeConversionGrant | undefined
  try {
    grant = await methods.prepareSessionNativeRuntimeConversion({
      compilation: descriptors[0]!.value,
      artifact,
      fact: descriptors[1]!.value,
      selection,
      signal,
    })
    signal.throwIfAborted()
    assertNativeAuthorityData(captured)
    retained.expected.runtimeJSX.assertLease()
    const binding: NativeRuntimeBinding = {
      ...captured,
      retained,
      artifact,
      compiler,
      methods,
      grant,
      signal,
      phase: 'prepared',
    }
    nativeRuntimeBindings.set(retained.artifact, binding)
    try {
      assertNativeBinding(binding)
    } catch (error) {
      nativeRuntimeBindings.delete(retained.artifact)
      throw error
    }
    return retained
  } catch (error) {
    if (grant) methods.retireSessionNativeRuntimeConversion(grant)
    throw error
  }
}
export async function assertNativeCompilerRuntimeCoverage(
  artifact: CompiledTestArtifact,
  completion: TestCoverageCompletion,
  expected: CoverageRuntimeAuthorization,
  signal: AbortSignal
): Promise<ReadonlySet<string>> {
  const binding = nativeRuntimeBindings.get(artifact)
  if (
    !binding ||
    binding.retained.completion !== completion ||
    binding.retained.expected !== expected ||
    binding.signal !== signal ||
    binding.phase !== 'prepared'
  )
    throw new Error('Missing exact retained native runtime authority')
  assertNativeBinding(binding)
  return assertCompilerRuntimeCoverageImpl(
    artifact,
    completion,
    expected,
    signal,
    binding
  )
}
export async function sealNativeRuntimeCoverageAuthorization(
  retained: RetainedRuntimeCoverage,
  signal: AbortSignal
): Promise<void> {
  const binding = nativeRuntimeBindings.get(retained.artifact)
  if (
    !binding ||
    binding.retained !== retained ||
    binding.signal !== signal ||
    binding.phase !== 'prepared'
  )
    throw new Error('Missing exact retained native runtime authority')
  assertNativeBinding(binding)
  binding.phase = 'sealing'
  await binding.methods.sealSessionNativeRuntimeConversion(
    binding.grant,
    binding.artifact,
    binding.descriptors[1].value,
    signal
  )
  assertNativeBinding(binding)
  binding.phase = 'sealed'
}
export function assertSealedNativeRuntimeCoverageAuthorization(
  retained: RetainedRuntimeCoverage,
  signal: AbortSignal
): void {
  const binding = nativeRuntimeBindings.get(retained.artifact)
  if (
    !binding ||
    binding.retained !== retained ||
    binding.signal !== signal ||
    binding.phase !== 'sealed'
  )
    throw new Error('Missing sealed native runtime authority')
  assertNativeBinding(binding)
}
export function retireNativeRuntimeCoverageAuthorization(
  retained: RetainedRuntimeCoverage
): void {
  const binding = nativeRuntimeBindings.get(retained.artifact)
  if (binding && binding.retained === retained) {
    nativeRuntimeBindings.delete(retained.artifact)
    binding.phase = 'retired'
    binding.methods.retireSessionNativeRuntimeConversion(binding.grant)
  }
}

/** Re-read before and after conversion while the actual parent's lease is held. */
export async function assertCompilerRuntimeCoverage(
  artifact: CompiledTestArtifact,
  completion: TestCoverageCompletion,
  expected: CoverageRuntimeAuthorization,
  signal: AbortSignal
): Promise<ReadonlySet<string>> {
  return assertCompilerRuntimeCoverageImpl(
    artifact,
    completion,
    expected,
    signal
  )
}

async function assertCompilerRuntimeCoverageImpl(
  artifact: CompiledTestArtifact,
  completion: TestCoverageCompletion,
  expected: CoverageRuntimeAuthorization,
  signal: AbortSignal,
  nativeBinding?: NativeRuntimeBinding
): Promise<ReadonlySet<string>> {
  const capability = expected.runtimeJSX
  function assertLease() {
    signal.throwIfAborted()
    if (nativeBinding) assertNativeBinding(nativeBinding)
    if (
      !capability ||
      typeof capability !== 'object' ||
      Array.isArray(capability) ||
      Reflect.ownKeys(capability).length !== 2 ||
      !['version', 'assertLease'].every((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(capability, key)
        return descriptor && Object.hasOwn(descriptor, 'value')
      }) ||
      capability.version !== 1 ||
      typeof capability.assertLease !== 'function'
    )
      throw new Error('Invalid private runtime JSX authorization')
    if (capability.assertLease() !== undefined)
      throw new Error(
        'Private runtime JSX lease must return synchronously with undefined'
      )
    if (nativeBinding) assertNativeBinding(nativeBinding)
  }
  assertLease()
  assertCoverageCompletion(completion, artifact, expected.runId)
  if (!completion.complete)
    throw new Error('Private runtime JSX requires complete worker coverage')
  const coverage = artifact.coverage
  if (
    artifact.version !== 2 ||
    artifact.kind !== 'node' ||
    !expected.runId ||
    !expected.revision ||
    artifact.entryId !== expected.entry.id ||
    artifact.revision !== expected.revision ||
    artifact.rootDir !== expected.artifactRoot ||
    artifact.sourceHash !== expected.entrySha256 ||
    !/^[a-f0-9]{64}$/.test(expected.entrySha256) ||
    !isDeepStrictEqual(artifact.profile, expected.entry.profile) ||
    artifact.profile.environment !== 'node' ||
    artifact.profile.runtime !== 'nodejs' ||
    artifact.profile.bundler !== 'turbopack' ||
    !['development', 'production'].includes(artifact.profile.mode) ||
    artifact.profile.route !== undefined ||
    artifact.profile.browserClient !== undefined ||
    !coverage ||
    coverage.version !== 1 ||
    ['sourceAnalysis', 'browser', 'syntheticSources'].some((key) =>
      Object.hasOwn(coverage, key)
    ) ||
    [
      'moduleMocking',
      'moduleCache',
      'dynamicModuleMocking',
      'cohort',
      'configurationImports',
      'runtimeConfigurationImports',
    ].some((key) => Object.hasOwn(artifact, key)) ||
    (Object.hasOwn(artifact, 'nativeTsConfigInputs') && !nativeBinding) ||
    artifact.diagnostics.some((item) => item.severity === 'error') ||
    !!artifact.setupFiles?.length ||
    !!artifact.snapshotSerializers?.length ||
    !Array.isArray(artifact.files) ||
    new Set(artifact.files).size !== artifact.files.length ||
    !artifact.files.includes(artifact.entryPath) ||
    !Array.isArray(expected.selectedSources)
  )
    throw new Error('Unrequested or incompatible compiler runtime coverage')
  const project = await realpath(expected.projectDir)
  assertLease()
  if ((await realpath(expected.artifactRoot)) !== expected.artifactRoot)
    throw new Error('Runtime coverage artifact escapes parent authorization')
  async function assertSource(source: { file: string; sha256: string }) {
    assertLease()
    if (
      typeof source.file !== 'string' ||
      !/^[a-f0-9]{64}$/.test(source.sha256) ||
      !within(project, source.file) ||
      source.file.split(/[\\/]/).includes('node_modules') ||
      !(await lstat(source.file)).isFile() ||
      (await realpath(source.file)) !== source.file ||
      coverageHash(await readFile(source.file)) !== source.sha256
    )
      throw new Error('Runtime coverage source differs from parent selection')
    assertLease()
  }
  await assertSource({
    file: expected.entry.file,
    sha256: expected.entrySha256,
  })
  const selected = new Set<string>()
  for (const source of expected.selectedSources) {
    if (
      !source ||
      typeof source !== 'object' ||
      !/\.[cm]?[jt]sx?$/.test(source.file) ||
      /\.d\.[cm]?tsx?$/.test(source.file) ||
      /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(source.file) ||
      selected.has(source.file)
    )
      throw new Error('Invalid parent runtime coverage source selection')
    await assertSource(source)
    selected.add(source.file)
  }
  assertLease()
  if (artifact.profile.mode === 'production')
    await verifySourceCoverageArtifact(artifact)
  else if (Object.hasOwn(coverage, 'sourcePreservation'))
    throw new Error('Unrequested production runtime coverage provenance')
  assertLease()
  await verifyImportCoverageArtifact(artifact)
  assertLease()
  const rebuilt = await buildCoverageMetadata({
    rootDir: artifact.rootDir,
    files: artifact.files,
    projectDir: project,
    sourceRootDir: project,
    entryFile: expected.entry.file,
    setupFiles: artifact.setupFiles ?? [],
  })
  assertLease()
  const {
    importRoles: _verifiedImports,
    sourcePreservation: _verifiedPreservation,
    ...declared
  } = coverage
  if (
    !isDeepStrictEqual(
      { ...rebuilt, sources: { ...rebuilt.sources } },
      { ...declared, sources: { ...declared.sources } }
    )
  )
    throw new Error(
      'Compiler runtime coverage metadata differs from emitted closure'
    )
  for (const source of expected.selectedSources)
    if (
      !Object.values(rebuilt.sources).some(
        (value) => value && isDeepStrictEqual(value, source)
      )
    )
      throw new Error('Parent runtime source is absent from emitted maps')
  // Retain every output identity, including scripts the worker did not execute.
  for (const script of rebuilt.scripts) {
    assertLease()
    if (
      coverageHash(await readArtifactFile(artifact.rootDir, script.path)) !==
        script.sha256 ||
      (script.mapPath &&
        coverageHash(
          await readArtifactFile(artifact.rootDir, script.mapPath)
        ) !== script.mapSha256)
    )
      throw new Error(
        'Compiler runtime coverage bytes changed during authorization'
      )
  }
  assertLease()
  return selected
}
