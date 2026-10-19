import { sourceAnalysisEntryId } from './source-authorization'
import {
  readConfigurationImportProof,
  type ConfigurationImportAuthorization,
} from '../compiler/config-import-proof'
import { lstat, readFile, realpath } from 'fs/promises'
import { isDeepStrictEqual } from 'util'
import type { TestProfile } from '../contracts'
import {
  buildCoverageMetadata,
  coverageHash,
  readArtifactFile,
  within,
} from './artifact'
import { analyzeCompiledSourceData } from './istanbul'
import { decodeCoverageMap } from './maps'
import { verifySourceCoverageArtifact } from './source-profile'
import { verifyImportCoverageArtifact } from './import-roles'
import type { CompiledCoverageSource, CompilerSourceCoverage } from './types'

export { sourceAnalysisEntryId } from './source-authorization'
export { analyzeCompiledCoverageSourceWithNativeTsConfigInputs } from './istanbul'

/** The parent supplies every authorization field; none are accepted from compiler IPC. */
export interface CoverageSourceAuthorization {
  projectDir: string
  artifactRoot: string
  revision: string
  profile: TestProfile
  source: { file: string; sha256: string }
  configurationImports?: ConfigurationImportAuthorization
  /** Parent-owned lease capability; never serialized with compiler artifacts. */
  nativeImportCoverageRoles?: { version: 1; assertLease(): void }
}

/** Validate actual compiler bytes/maps while the compiler's immutable lease remains live. */
export async function analyzeCompiledCoverageSource(
  value: CompiledCoverageSource,
  expected: CoverageSourceAuthorization,
  signal: AbortSignal
): Promise<CompilerSourceCoverage> {
  if (
    Object.hasOwn(value, 'nativeTsConfigInputs') ||
    Object.hasOwn(value.artifact, 'nativeTsConfigInputs')
  ) {
    signal.throwIfAborted()
    throw new Error(
      'Native TypeScript config inputs require separate parent authorization'
    )
  }
  const privateRoles = expected.nativeImportCoverageRoles
  function assertPrivateLease() {
    signal.throwIfAborted()
    if (privateRoles === undefined) return
    if (
      !privateRoles ||
      typeof privateRoles !== 'object' ||
      Array.isArray(privateRoles) ||
      Reflect.ownKeys(privateRoles).length !== 2 ||
      !Object.hasOwn(privateRoles, 'version') ||
      !Object.hasOwn(privateRoles, 'assertLease') ||
      privateRoles.version !== 1 ||
      typeof privateRoles.assertLease !== 'function'
    )
      throw new Error('Invalid private native import coverage authorization')
    if (privateRoles.assertLease() !== undefined)
      throw new Error(
        'Private native import coverage lease must return synchronously with undefined'
      )
  }
  assertPrivateLease()
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
  const configurationGraph = await readConfigurationImportProof(
    artifact,
    value.configurationImports,
    expected.configurationImports,
    signal
  )
  assertPrivateLease()
  const project = await realpath(expected.projectDir)
  if (
    (await realpath(expected.artifactRoot)) !== expected.artifactRoot ||
    !(await lstat(source.file)).isFile() ||
    (await realpath(source.file)) !== source.file ||
    !within(project, source.file) ||
    source.file.split(/[\\/]/).includes('node_modules')
  )
    throw new Error(
      'Coverage analysis source or artifact escapes its parent authorization'
    )
  assertPrivateLease()
  const content = await readFile(source.file, 'utf8')
  if (coverageHash(content) !== source.sha256)
    throw new Error('Coverage analysis source changed after parent selection')
  if (artifact.profile.mode === 'production')
    await verifySourceCoverageArtifact(artifact)
  else if (artifact.coverage!.sourcePreservation)
    throw new Error('Unrequested production coverage analysis provenance')
  if (privateRoles) {
    assertPrivateLease()
    await verifyImportCoverageArtifact(artifact)
    assertPrivateLease()
  }
  const rebuilt = await buildCoverageMetadata({
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
      await readArtifactFile(artifact.rootDir, script.path)
    ).toString('utf8')
    const map = decodeCoverageMap(
      JSON.parse(
        (await readArtifactFile(artifact.rootDir, script.mapPath)).toString(
          'utf8'
        )
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
  const data = await analyzeCompiledSourceData(
    artifact,
    source.file,
    jsxSource ? { jsxFile: source.file } : undefined
  )
  assertPrivateLease()
  // Reject cancellation or source/output mutation after conversion as well.
  signal.throwIfAborted()
  if (coverageHash(await readFile(source.file)) !== source.sha256)
    throw new Error('Coverage analysis source changed during conversion')
  for (const script of rebuilt.scripts) {
    signal.throwIfAborted()
    if (
      coverageHash(await readArtifactFile(artifact.rootDir, script.path)) !==
        script.sha256 ||
      (script.mapPath &&
        coverageHash(
          await readArtifactFile(artifact.rootDir, script.mapPath)
        ) !== script.mapSha256)
    )
      throw new Error(
        'Compiler coverage analysis bytes changed during conversion'
      )
  }
  await readConfigurationImportProof(
    artifact,
    value.configurationImports,
    expected.configurationImports,
    signal
  )
  if (privateRoles) {
    assertPrivateLease()
    await verifyImportCoverageArtifact(artifact)
  }
  assertPrivateLease()
  return {
    version: 1,
    kind: 'next-compiler-declarations',
    source: { ...source },
    profile: { ...artifact.profile },
    compiler: {
      entryId: artifact.entryId,
      revision: artifact.revision,
      ...(expected.configurationImports && configurationGraph
        ? {
            configurationImports: {
              request: { ...expected.configurationImports },
              graph: configurationGraph,
            },
          }
        : {}),
    },
    data,
  }
}
