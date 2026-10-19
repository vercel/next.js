import { lstat, readFile, realpath } from 'fs/promises'
import { isDeepStrictEqual } from 'util'
import type { TestProfile } from '../contracts'
import type {
  NativeTsConfigParentSelection,
  SessionNativeTsConfigCompilation,
  SessionNativeCompilerSourceConversionGrant,
} from '../compiler'
import { readConfigurationImportProof } from '../compiler/config-import-proof'
import {
  buildCoverageMetadata,
  coverageHash,
  readArtifactFile,
  within,
} from './artifact'
import { decodeCoverageMap } from './maps'
import { verifySourceCoverageArtifact } from './source-profile'
import { verifyImportCoverageArtifact } from './import-roles'
import type { ParentNativeTsConfigFact } from './native-tsconfig-inputs'
import type { CompiledCoverageSource } from './types'
import type { CoverageSourceAuthorization } from './source-analysis'

export function sourceAnalysisEntryId(
  profile: TestProfile,
  file: string
): string {
  return `coverage-source:${coverageHash(JSON.stringify([profile.id, profile.mode, profile.environment, profile.runtime, profile.bundler, profile.route ?? null, profile.browserClient ?? null, file]))}`
}

/** Original native source authority stays outside serializable compiler data. */
export interface SourceNativeInputsAuthorization {
  compilation: SessionNativeTsConfigCompilation
  fact: ParentNativeTsConfigFact
  selection: NativeTsConfigParentSelection
}
export interface RetainedNativeCompilerSource {
  readonly value: CompiledCoverageSource
  readonly expected: CoverageSourceAuthorization
}
type NativeCompiler = typeof import('../compiler/index.js')
type SourceMethods = Pick<
  NativeCompiler,
  | 'prepareSessionNativeCompilerSourceConversion'
  | 'assertSessionNativeCompilerSourceConversion'
  | 'sealSessionNativeCompilerSourceConversion'
  | 'retireSessionNativeCompilerSourceConversion'
>
type Phase =
  | 'native-prepared'
  | 'before-validating'
  | 'fully-before-validated'
  | 'after-validating'
  | 'post-validated'
  | 'sealing'
  | 'sealed'
  | 'failed'
  | 'retired'
interface CapturedSource {
  value: CompiledCoverageSource
  expected: CoverageSourceAuthorization
  native: SourceNativeInputsAuthorization
  signal: AbortSignal
  valueSnapshot: CompiledCoverageSource
  expectedSnapshot: CoverageSourceAuthorization
  identityData: CapturedIdentityData[]
  capabilityProperty: PropertyDescriptor
  nativePrototype: object | null
  nativeDescriptors: PropertyDescriptor[]
  selection: NativeTsConfigParentSelection
  capability: { version: 1; assertLease(): void }
  capabilityPrototype: object | null
  version: PropertyDescriptor
  callback: PropertyDescriptor
}
interface SourceBinding {
  retained: RetainedNativeCompilerSource
  captured: CapturedSource
  compiler: NativeCompiler
  methods: SourceMethods
  grant: SessionNativeCompilerSourceConversionGrant
  phase: Phase
}
const sourceBindings = new WeakMap<
  RetainedNativeCompilerSource,
  SourceBinding
>()
const nativeKeys = ['compilation', 'fact', 'selection'] as const
const expectedKeys = [
  'projectDir',
  'artifactRoot',
  'revision',
  'profile',
  'source',
  'nativeImportCoverageRoles',
] as const
function fail(message: string): never {
  throw new Error(message)
}
function record(
  value: unknown,
  keys: readonly string[],
  label: string
): PropertyDescriptor[] {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length !== keys.length ||
    Reflect.ownKeys(value).some(
      (key) => typeof key !== 'string' || !keys.includes(key)
    )
  )
    fail('Invalid private compiler source ' + label)
  const descriptors = keys.map(
    (key) => Object.getOwnPropertyDescriptor(value, key)!
  )
  if (
    descriptors.some(
      (item) => !item || !Object.hasOwn(item, 'value') || !item.enumerable
    )
  )
    fail('Invalid private compiler source ' + label)
  return descriptors
}
interface CapturedIdentityData {
  value: object
  prototype: object | null
  keys: PropertyKey[]
  descriptors: PropertyDescriptor[]
  omittedSourceCapability: boolean
}
function dataPrototype(value: object): object | null {
  const prototype = Object.getPrototypeOf(value)
  if (![Object.prototype, null, Array.prototype].includes(prototype))
    fail('Unsupported private compiler source authority prototype')
  return prototype
}
function snapshotData(
  value: any,
  omitSourceCapability = false,
  ancestors = new Set<object>()
): any {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function')
      fail('Non-data private compiler source authority')
    return value
  }
  if (ancestors.has(value)) fail('Cyclic private compiler source authority')
  const prototype = dataPrototype(value)
  const result = Array.isArray(value) ? [] : Object.create(prototype)
  const next = new Set(ancestors).add(value)
  for (const key of Reflect.ownKeys(value)) {
    if (omitSourceCapability && key === 'nativeImportCoverageRoles') continue
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value'))
      fail('Non-data private compiler source authority property')
    Object.defineProperty(result, key, {
      ...descriptor,
      value: snapshotData(descriptor.value, false, next),
    })
  }
  return result
}
function captureIdentityData(
  value: unknown,
  omitSourceCapability = false
): CapturedIdentityData[] {
  const result: CapturedIdentityData[] = []
  const seen = new Set<object>()
  function visit(current: unknown, omit: boolean) {
    if (current === null || typeof current !== 'object' || seen.has(current))
      return
    seen.add(current)
    const prototype = dataPrototype(current)
    const keys = Reflect.ownKeys(current).filter(
      (key) => !omit || key !== 'nativeImportCoverageRoles'
    )
    const descriptors = keys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(current, key)!
      if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value'))
        fail('Non-data private compiler source authority property')
      return descriptor
    })
    result.push({
      value: current,
      prototype,
      keys,
      descriptors,
      omittedSourceCapability: omit,
    })
    for (const descriptor of descriptors) visit(descriptor.value, false)
  }
  visit(value, omitSourceCapability)
  return result
}
function sameIdentityData(retained: CapturedIdentityData): boolean {
  const keys = Reflect.ownKeys(retained.value).filter(
    (key) =>
      !retained.omittedSourceCapability || key !== 'nativeImportCoverageRoles'
  )
  return (
    Object.getPrototypeOf(retained.value) === retained.prototype &&
    keys.length === retained.keys.length &&
    keys.every(
      (key, index) =>
        key === retained.keys[index] &&
        sameDescriptor(
          Object.getOwnPropertyDescriptor(retained.value, key),
          retained.descriptors[index]
        )
    )
  )
}
function freezeData<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Reflect.ownKeys(value))
      freezeData(Object.getOwnPropertyDescriptor(value, key)!.value)
    Object.freeze(value)
  }
  return value
}
function sameDescriptor(
  actual: PropertyDescriptor | undefined,
  expected: PropertyDescriptor
): boolean {
  return (
    !!actual &&
    ['value', 'get', 'set', 'writable', 'enumerable', 'configurable'].every(
      (key) =>
        Object.hasOwn(actual, key) === Object.hasOwn(expected, key) &&
        Object.is(
          actual[key as keyof PropertyDescriptor],
          expected[key as keyof PropertyDescriptor]
        )
    )
  )
}
function refuseModuleAuthority(value: unknown, expected: unknown) {
  for (const item of [value, expected])
    if (
      item &&
      typeof item === 'object' &&
      ['configurationImports', 'runtimeConfigurationImports'].some((key) =>
        Object.hasOwn(item, key)
      )
    )
      fail(
        'Native compiler source requires separate JavaScript module authorization'
      )
  const descriptor =
    value && typeof value === 'object'
      ? Object.getOwnPropertyDescriptor(value, 'artifact')
      : undefined
  if (
    descriptor &&
    Object.hasOwn(descriptor, 'value') &&
    descriptor.value &&
    typeof descriptor.value === 'object' &&
    ['configurationImports', 'runtimeConfigurationImports'].some((key) =>
      Object.hasOwn(descriptor.value, key)
    )
  )
    fail(
      'Native compiler source requires separate JavaScript module authorization'
    )
}
function assertCaptured(c: CapturedSource) {
  c.signal.throwIfAborted()
  refuseModuleAuthority(c.value, c.expected)
  if (
    !c.identityData.every(sameIdentityData) ||
    Object.getPrototypeOf(c.native) !== c.nativePrototype ||
    Reflect.ownKeys(c.native).length !== 3 ||
    !nativeKeys.every((key, index) =>
      sameDescriptor(
        Object.getOwnPropertyDescriptor(c.native, key),
        c.nativeDescriptors[index]
      )
    ) ||
    Object.getPrototypeOf(c.capability) !== c.capabilityPrototype ||
    Reflect.ownKeys(c.capability).length !== 2 ||
    !sameDescriptor(
      Object.getOwnPropertyDescriptor(c.capability, 'version'),
      c.version
    ) ||
    !sameDescriptor(
      Object.getOwnPropertyDescriptor(c.capability, 'assertLease'),
      c.callback
    )
  )
    fail('Parent compiler source authorization changed during conversion')
  const cap = Object.getOwnPropertyDescriptor(
    c.expected,
    'nativeImportCoverageRoles'
  )
  if (!sameDescriptor(cap, c.capabilityProperty))
    fail('Parent compiler source capability changed during conversion')
}
function assertCapturedLease(c: CapturedSource) {
  assertCaptured(c)
  if (Reflect.apply(c.callback.value, c.capability, []) !== undefined)
    fail(
      'Private compiler source lease must return synchronously with undefined'
    )
  assertCaptured(c)
}
function bindingFor(
  retained: RetainedNativeCompilerSource,
  signal: AbortSignal
): SourceBinding {
  const binding = sourceBindings.get(retained)
  if (
    !binding ||
    binding.retained !== retained ||
    binding.captured.signal !== signal ||
    ['failed', 'retired'].includes(binding.phase)
  )
    fail('Missing exact retained native compiler source authority')
  return binding
}
function assertBinding(binding: SourceBinding) {
  const { captured: c } = binding
  if (
    sourceBindings.get(binding.retained) !== binding ||
    ['failed', 'retired'].includes(binding.phase)
  )
    fail('Missing exact retained native compiler source authority')
  const check = () => {
    assertCaptured(c)
    for (const key of Object.keys(binding.methods) as (keyof SourceMethods)[])
      if (binding.compiler[key] !== binding.methods[key])
        fail('Compiler source grant operations changed')
    binding.methods.assertSessionNativeCompilerSourceConversion(
      binding.grant,
      c.value,
      c.nativeDescriptors[1].value,
      c.signal
    )
    c.signal.throwIfAborted()
  }
  check()
  if (Reflect.apply(c.callback.value, c.capability, []) !== undefined)
    fail(
      'Private compiler source lease must return synchronously with undefined'
    )
  check()
}
/** Exact data/descriptors and original opaque pointers are captured before awaits. */
export async function retainNativeCompilerSourceAuthorization(
  value: CompiledCoverageSource,
  expected: CoverageSourceAuthorization,
  native: SourceNativeInputsAuthorization,
  signal: AbortSignal
): Promise<RetainedNativeCompilerSource> {
  signal.throwIfAborted()
  refuseModuleAuthority(value, expected)
  const valueDescriptors = record(
    value,
    ['version', 'kind', 'source', 'artifact'],
    'value'
  )
  const expectedDescriptors = record(expected, expectedKeys, 'expected')
  const nativeDescriptors = record(native, nativeKeys, 'native')
  const capability = Object.getOwnPropertyDescriptor(
    expected,
    'nativeImportCoverageRoles'
  )!.value
  const [version, callback] = record(
    capability,
    ['version', 'assertLease'],
    'capability'
  )
  if (version.value !== 1 || typeof callback.value !== 'function')
    fail('Invalid private compiler source capability')
  const artifact = valueDescriptors[3].value
  if (
    !artifact ||
    typeof artifact !== 'object' ||
    !Object.hasOwn(artifact, 'nativeTsConfigInputs')
  )
    fail('Private native compiler source requires its original marker')
  const captured: CapturedSource = {
    value,
    expected,
    native,
    signal,
    valueSnapshot: snapshotData(value),
    expectedSnapshot: snapshotData(expected, true),
    identityData: [
      ...captureIdentityData(value),
      ...captureIdentityData(expected, true),
      ...captureIdentityData(nativeDescriptors[2].value),
    ],
    capabilityProperty: expectedDescriptors[5],
    nativePrototype: Object.getPrototypeOf(native),
    nativeDescriptors,
    selection: snapshotData(nativeDescriptors[2].value),
    capability,
    capabilityPrototype: Object.getPrototypeOf(capability),
    version,
    callback,
  }
  assertCapturedLease(captured)
  const compiler = await Promise.resolve().then(
    () =>
      require('../compiler/index.js') as typeof import('../compiler/index.js')
  )
  assertCapturedLease(captured)
  const methods: SourceMethods = {
    prepareSessionNativeCompilerSourceConversion:
      compiler.prepareSessionNativeCompilerSourceConversion,
    assertSessionNativeCompilerSourceConversion:
      compiler.assertSessionNativeCompilerSourceConversion,
    sealSessionNativeCompilerSourceConversion:
      compiler.sealSessionNativeCompilerSourceConversion,
    retireSessionNativeCompilerSourceConversion:
      compiler.retireSessionNativeCompilerSourceConversion,
  }
  let grant: SessionNativeCompilerSourceConversionGrant | undefined
  try {
    grant = await methods.prepareSessionNativeCompilerSourceConversion({
      compilation: nativeDescriptors[0].value,
      value,
      fact: nativeDescriptors[1].value,
      selection: freezeData(snapshotData(captured.selection)),
      signal,
    })
    assertCapturedLease(captured)
    let retained: RetainedNativeCompilerSource
    const guardedCapability = Object.freeze({
      version: 1 as const,
      assertLease() {
        const binding = sourceBindings.get(retained)
        if (!binding)
          fail('Missing exact retained native compiler source authority')
        assertBinding(binding)
      },
    })
    retained = Object.freeze({
      value: freezeData(snapshotData(captured.valueSnapshot)),
      expected: freezeData(
        Object.assign(snapshotData(captured.expectedSnapshot), {
          nativeImportCoverageRoles: guardedCapability,
        })
      ),
    })
    const binding: SourceBinding = {
      retained,
      captured,
      compiler,
      methods,
      grant,
      phase: 'native-prepared',
    }
    sourceBindings.set(retained, binding)
    try {
      assertBinding(binding)
    } catch (error) {
      sourceBindings.delete(retained)
      throw error
    }
    return retained
  } catch (error) {
    if (grant) methods.retireSessionNativeCompilerSourceConversion(grant)
    throw error
  }
}

async function guardedRealpath(binding: SourceBinding, file: string) {
  assertBinding(binding)
  const result = await realpath(file)
  assertBinding(binding)
  return result
}
async function guardedLstat(binding: SourceBinding, file: string) {
  assertBinding(binding)
  const result = await lstat(file)
  assertBinding(binding)
  return result
}
async function guardedReadFile(binding: SourceBinding, file: string) {
  assertBinding(binding)
  const result = await readFile(file)
  assertBinding(binding)
  return result
}
async function guardedReadArtifact(
  binding: SourceBinding,
  root: string,
  file: string
) {
  assertBinding(binding)
  const result = await readArtifactFile(root, file)
  assertBinding(binding)
  return result
}
async function guardedReadConfiguration(
  binding: SourceBinding,
  ...args: Parameters<typeof readConfigurationImportProof>
) {
  assertBinding(binding)
  const result = await readConfigurationImportProof(...args)
  assertBinding(binding)
  return result
}
async function guardedPreservation(
  binding: SourceBinding,
  ...args: Parameters<typeof verifySourceCoverageArtifact>
) {
  assertBinding(binding)
  const result = await verifySourceCoverageArtifact(...args)
  assertBinding(binding)
  return result
}
async function guardedImport(
  binding: SourceBinding,
  ...args: Parameters<typeof verifyImportCoverageArtifact>
) {
  assertBinding(binding)
  const result = await verifyImportCoverageArtifact(...args)
  assertBinding(binding)
  return result
}
async function guardedMetadata(
  binding: SourceBinding,
  ...args: Parameters<typeof buildCoverageMetadata>
) {
  assertBinding(binding)
  const result = await buildCoverageMetadata(...args)
  assertBinding(binding)
  return result
}

/** Full legacy predicate/metadata/coordinate and post-byte checks, repeated twice. */
async function validateFullSource(binding: SourceBinding): Promise<void> {
  assertBinding(binding)
  const { value, expected } = binding.retained,
    signal = binding.captured.signal
  const privateRoles = expected.nativeImportCoverageRoles
  function assertPrivateLease() {
    assertBinding(binding)
  }
  const { artifact, source } = value
  const jsxSource = !!privateRoles && /\.[jt]sx$/.test(source.file)
  if (
    value.version !== 1 ||
    value.kind !== 'next-compiler-source' ||
    !isDeepStrictEqual(source, expected.source) ||
    artifact.version !== 2 ||
    artifact.kind !== 'node' ||
    !isDeepStrictEqual(artifact.profile, expected.profile) ||
    artifact.profile.environment !== 'node' ||
    artifact.profile.browserClient ||
    artifact.profile.runtime !== 'nodejs' ||
    artifact.profile.bundler !== 'turbopack' ||
    !['development', 'production'].includes(artifact.profile.mode) ||
    artifact.profile.route !== undefined ||
    artifact.rootDir !== expected.artifactRoot ||
    artifact.entryId !==
      sourceAnalysisEntryId(expected.profile, expected.source.file) ||
    !expected.revision ||
    artifact.revision !== expected.revision ||
    artifact.sourceHash !== source.sha256 ||
    !/^[a-f0-9]{64}$/.test(source.sha256) ||
    (!/\.[cm]?ts$/.test(source.file) && !jsxSource) ||
    /\.d\.(?:[cm]?ts|tsx)$/.test(source.file) ||
    /\.(?:test|spec)\.(?:[cm]?ts|[jt]sx)$/.test(source.file) ||
    artifact.runtimeConfigurationImports ||
    artifact.moduleMocking ||
    artifact.moduleCache ||
    artifact.dynamicModuleMocking ||
    artifact.cohort ||
    artifact.setupFiles?.length ||
    artifact.snapshotSerializers?.length ||
    artifact.diagnostics.some(
      (diagnostic) => diagnostic.severity === 'error'
    ) ||
    !isDeepStrictEqual(artifact.coverage?.sourceAnalysis, {
      version: 1,
      ...source,
    }) ||
    artifact.coverage?.browser ||
    artifact.coverage?.syntheticSources ||
    (!privateRoles && Object.hasOwn(artifact.coverage ?? {}, 'importRoles'))
  )
    throw new Error(
      'Unrequested or incompatible compiler coverage source analysis'
    )
  const configurationGraph = await guardedReadConfiguration(
    binding,
    artifact,
    value.configurationImports,
    expected.configurationImports,
    signal
  )
  assertPrivateLease()
  const project = await guardedRealpath(binding, expected.projectDir)
  if (
    (await guardedRealpath(binding, expected.artifactRoot)) !==
      expected.artifactRoot ||
    !(await guardedLstat(binding, source.file)).isFile() ||
    (await guardedRealpath(binding, source.file)) !== source.file ||
    !within(project, source.file) ||
    source.file.split(/[\\/]/).includes('node_modules')
  )
    throw new Error(
      'Coverage analysis source or artifact escapes its parent authorization'
    )
  assertPrivateLease()
  const content = (await guardedReadFile(binding, source.file)).toString('utf8')
  if (coverageHash(content) !== source.sha256)
    throw new Error('Coverage analysis source changed after parent selection')
  if (artifact.profile.mode === 'production')
    await guardedPreservation(binding, artifact)
  else if (artifact.coverage!.sourcePreservation)
    throw new Error('Unrequested production coverage analysis provenance')
  if (privateRoles) {
    assertPrivateLease()
    await guardedImport(binding, artifact)
    assertPrivateLease()
  }
  const rebuilt = await guardedMetadata(binding, {
    rootDir: artifact.rootDir,
    files: artifact.files,
    projectDir: project,
    // Qualified Node maps use absolute file URIs. Relative native roots cannot
    // be supplied by compiler IPC as authority for a different source tree.
    sourceRootDir: project,
    entryFile: source.file,
    setupFiles: [],
    includeEntrySource: true,
  })
  assertPrivateLease()
  const {
    sourceAnalysis: _analysis,
    sourcePreservation: _preservation,
    ...coverageDeclared
  } = artifact.coverage!
  let declared = coverageDeclared
  if (privateRoles) {
    const { importRoles: _verifiedImportRoles, ...withoutImportRoles } =
      declared
    declared = withoutImportRoles
  }
  if (
    // IPC preserves dictionary keys/values but not a null prototype. Compare
    // that record explicitly while retaining every other metadata field.
    !isDeepStrictEqual(
      { ...rebuilt, sources: { ...rebuilt.sources } },
      { ...declared, sources: { ...declared.sources } }
    ) ||
    !artifact.files.includes(artifact.entryPath)
  )
    throw new Error(
      'Compiler coverage analysis metadata does not match its emitted closure'
    )
  const positions = new Map<string, string[]>()
  function position(text: string, line: number, column: number) {
    let lines = positions.get(text)
    if (!lines) positions.set(text, (lines = text.split('\n')))
    if (
      !Number.isSafeInteger(line) ||
      line < 1 ||
      line > lines.length ||
      !Number.isSafeInteger(column) ||
      column < 0 ||
      column > lines[line - 1].length
    )
      throw new Error(
        'Compiler coverage analysis coordinate exceeds retained content'
      )
  }
  for (const script of rebuilt.scripts) {
    assertPrivateLease()
    if (!script.mapPath) continue
    const generated = (
      await guardedReadArtifact(binding, artifact.rootDir, script.path)
    ).toString('utf8')
    const map = decodeCoverageMap(
      JSON.parse(
        (
          await guardedReadArtifact(binding, artifact.rootDir, script.mapPath)
        ).toString('utf8')
      )
    )
    for (const mapping of map.mappings) {
      position(generated, mapping.generatedLine, mapping.generatedColumn)
      if (mapping.source === null) continue
      const original = map.sources.get(mapping.source)
      if (typeof original !== 'string')
        throw new Error(
          'Compiler coverage analysis has no retained original source content'
        )
      position(original, mapping.originalLine!, mapping.originalColumn!)
    }
  }
  assertPrivateLease()
  // Reject cancellation or source/output mutation after conversion as well.
  signal.throwIfAborted()
  if (
    coverageHash(await guardedReadFile(binding, source.file)) !== source.sha256
  )
    throw new Error('Coverage analysis source changed during conversion')
  for (const script of rebuilt.scripts) {
    signal.throwIfAborted()
    if (
      coverageHash(
        await guardedReadArtifact(binding, artifact.rootDir, script.path)
      ) !== script.sha256 ||
      (script.mapPath &&
        coverageHash(
          await guardedReadArtifact(binding, artifact.rootDir, script.mapPath)
        ) !== script.mapSha256)
    )
      throw new Error(
        'Compiler coverage analysis bytes changed during conversion'
      )
  }
  await guardedReadConfiguration(
    binding,
    artifact,
    value.configurationImports,
    expected.configurationImports,
    signal
  )
  if (privateRoles) {
    assertPrivateLease()
    await guardedImport(binding, artifact)
  }
  assertPrivateLease()
  void configurationGraph
}
function markValidationFailed(binding: SourceBinding): void {
  if (binding.phase !== 'retired') binding.phase = 'failed'
}
export async function validateNativeCompilerSourceBefore(
  retained: RetainedNativeCompilerSource,
  signal: AbortSignal
): Promise<void> {
  const binding = bindingFor(retained, signal)
  if (binding.phase !== 'native-prepared')
    fail('Native compiler source requires its before-validation phase')
  assertBinding(binding)
  binding.phase = 'before-validating'
  try {
    await validateFullSource(binding)
    assertBinding(binding)
    binding.phase = 'fully-before-validated'
  } catch (error) {
    markValidationFailed(binding)
    throw error
  }
}
/** A ready check cannot insert or advance Istanbul's private zero scope. */
export function assertBeforeValidatedNativeCompilerSource(
  retained: RetainedNativeCompilerSource,
  signal: AbortSignal
): void {
  const binding = bindingFor(retained, signal)
  if (binding.phase !== 'fully-before-validated')
    fail('Native compiler source is not fully before-validated')
  assertBinding(binding)
}
export async function validateNativeCompilerSourceAfter(
  retained: RetainedNativeCompilerSource,
  signal: AbortSignal
): Promise<void> {
  const binding = bindingFor(retained, signal)
  if (binding.phase !== 'fully-before-validated')
    fail('Native compiler source requires its post-validation phase')
  assertBinding(binding)
  binding.phase = 'after-validating'
  try {
    await validateFullSource(binding)
    assertBinding(binding)
    binding.phase = 'post-validated'
  } catch (error) {
    markValidationFailed(binding)
    throw error
  }
}
export async function sealNativeCompilerSourceAuthorization(
  retained: RetainedNativeCompilerSource,
  signal: AbortSignal
): Promise<void> {
  const binding = bindingFor(retained, signal)
  if (binding.phase !== 'post-validated')
    fail('Native compiler source requires complete post-validation')
  assertBinding(binding)
  binding.phase = 'sealing'
  try {
    await binding.methods.sealSessionNativeCompilerSourceConversion(
      binding.grant,
      binding.captured.value,
      binding.captured.nativeDescriptors[1].value,
      signal
    )
    assertBinding(binding)
    binding.phase = 'sealed'
  } catch (error) {
    markValidationFailed(binding)
    throw error
  }
}
export function assertSealedNativeCompilerSourceAuthorization(
  retained: RetainedNativeCompilerSource,
  signal: AbortSignal
): void {
  const binding = bindingFor(retained, signal)
  if (binding.phase !== 'sealed')
    fail('Missing sealed native compiler source authority')
  assertBinding(binding)
}
export function retireNativeCompilerSourceAuthorization(
  retained: RetainedNativeCompilerSource
): void {
  const binding = sourceBindings.get(retained)
  if (binding && binding.retained === retained) {
    sourceBindings.delete(retained)
    binding.phase = 'retired'
    binding.methods.retireSessionNativeCompilerSourceConversion(binding.grant)
  }
}
