import { lstat, readFile, realpath } from 'fs/promises'
import { isDeepStrictEqual } from 'util'
import {
  readConfigurationImportProof,
  type ConfigurationImportAuthorization,
} from '../compiler/config-import-proof'
import {
  assertBrowserCoverageArtifact,
  buildBrowserCoverageMetadata,
} from '../client/coverage-artifact'
import { coverageHash, readArtifactFile, within } from './artifact'
import { analyzeCompiledSourceData } from './istanbul'
import { decodeCoverageMap } from './maps'
import {
  sourceAnalysisEntryId,
  type CoverageSourceAuthorization,
} from './source-analysis'
import type { CompiledCoverageSource, CompilerSourceCoverage } from './types'

export type BrowserCoverageSourceAuthorization = Omit<
  CoverageSourceAuthorization,
  'nativeImportCoverageRoles' | 'configurationImports'
> & {
  configurationImports: ConfigurationImportAuthorization
  /** Actual parent compiler lifetime; never serialized with declaration facts. */
  assertLease(): void
}

/** Browser declarations retain their actual Browser graph, source and configuration. */
export async function analyzeCompiledBrowserCoverageSource(
  value: CompiledCoverageSource,
  expected: BrowserCoverageSourceAuthorization,
  signal: AbortSignal
): Promise<CompilerSourceCoverage> {
  const { assertLease, ...authorization } = expected
  const retained = structuredClone(authorization)
  function lease() {
    signal.throwIfAborted()
    if (
      typeof assertLease !== 'function' ||
      assertLease() !== undefined ||
      !isDeepStrictEqual(authorization, retained) ||
      Object.hasOwn(expected, 'nativeImportCoverageRoles')
    )
      throw new Error('Browser declaration analysis lost its parent lease')
  }
  lease()
  const { artifact, source } = value
  if (
    value.version !== 1 ||
    value.kind !== 'next-compiler-source' ||
    Object.hasOwn(value, 'nativeTsConfigInputs') ||
    Object.hasOwn(artifact, 'nativeTsConfigInputs') ||
    !isDeepStrictEqual(source, retained.source) ||
    artifact.version !== 2 ||
    artifact.kind !== 'browser' ||
    !isDeepStrictEqual(artifact.profile, retained.profile) ||
    artifact.profile.environment !== 'browser' ||
    artifact.profile.browserClient !== true ||
    artifact.profile.runtime !== 'nodejs' ||
    artifact.profile.bundler !== 'turbopack' ||
    !['development', 'production'].includes(artifact.profile.mode) ||
    artifact.profile.route !== undefined ||
    artifact.rootDir !== retained.artifactRoot ||
    artifact.entryId !== sourceAnalysisEntryId(retained.profile, source.file) ||
    !retained.revision ||
    artifact.revision !== retained.revision ||
    artifact.sourceHash !== source.sha256 ||
    !/^[a-f0-9]{64}$/.test(source.sha256) ||
    !/\.(?:[cm]?ts|[jt]sx)$/.test(source.file) ||
    /\.d\.(?:[cm]?ts|tsx)$/.test(source.file) ||
    /\.(?:test|spec)\.(?:[cm]?ts|[jt]sx)$/.test(source.file) ||
    artifact.runtimeConfigurationImports ||
    artifact.moduleMocking ||
    Object.hasOwn(artifact, 'moduleCache') ||
    Object.hasOwn(artifact, 'dynamicModuleMocking') ||
    Object.hasOwn(artifact, 'cohort') ||
    artifact.setupFiles?.length ||
    artifact.snapshotSerializers?.length ||
    artifact.diagnostics.some(
      (diagnostic) => diagnostic.severity === 'error'
    ) ||
    artifact.coverage?.version !== 1 ||
    !isDeepStrictEqual(artifact.coverage?.sourceAnalysis, {
      version: 1,
      ...source,
    }) ||
    !(
      (artifact.profile.mode === 'production' &&
        artifact.coverage.browser?.version === 2) ||
      (artifact.profile.mode === 'development' &&
        /\.(?:ts|mts|[jt]sx)$/.test(source.file) &&
        artifact.coverage.browser?.version === 1)
    ) ||
    artifact.coverage.sourcePreservation ||
    artifact.coverage.syntheticSources ||
    Object.hasOwn(artifact.coverage, 'importRoles')
  )
    throw new Error(
      'Unrequested or incompatible Browser compiler declaration analysis'
    )
  const browserArtifact = artifact
  const project = await realpath(retained.projectDir)
  if (
    (await realpath(retained.artifactRoot)) !== retained.artifactRoot ||
    !(await lstat(source.file)).isFile() ||
    (await realpath(source.file)) !== source.file ||
    !within(project, source.file) ||
    source.file.split(/[\\/]/).includes('node_modules')
  )
    throw new Error('Browser declaration source or artifact escaped its parent')
  async function current() {
    lease()
    await assertBrowserCoverageArtifact(browserArtifact)
    if (coverageHash(await readFile(source.file)) !== source.sha256)
      throw new Error('Browser declaration source changed after selection')
    const graph = await readConfigurationImportProof(
      artifact,
      value.configurationImports,
      retained.configurationImports,
      signal
    )
    lease()
    return graph
  }
  const graph = await current()
  const rebuilt = await buildBrowserCoverageMetadata({
    rootDir: artifact.rootDir,
    entryPath: artifact.entryPath,
    files: artifact.files,
    projectDir: project,
    sourceRootDir: project,
    entryFile: source.file,
    setupFiles: [],
    includeEntrySource: true,
  })
  const { sourceAnalysis: _analysis, ...declared } = artifact.coverage
  if (
    !isDeepStrictEqual(
      { ...rebuilt, sources: { ...rebuilt.sources } },
      { ...declared, sources: { ...declared.sources } }
    )
  )
    throw new Error(
      'Browser declaration metadata differs from its actual output'
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
      throw new Error('Browser declaration map exceeds retained source content')
  }
  for (const script of rebuilt.scripts) {
    lease()
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
        throw new Error('Browser declaration map lost its original source')
      position(original, mapping.originalLine!, mapping.originalColumn!)
    }
  }
  lease()
  const data = await analyzeCompiledSourceData(
    artifact,
    source.file,
    /\.[jt]sx$/.test(source.file) ? { jsxFile: source.file } : undefined
  )
  if (!isDeepStrictEqual(graph, await current()))
    throw new Error(
      'Browser declaration configuration changed during conversion'
    )
  for (const script of rebuilt.scripts) {
    lease()
    if (
      coverageHash(await readArtifactFile(artifact.rootDir, script.path)) !==
        script.sha256 ||
      (script.mapPath &&
        coverageHash(
          await readArtifactFile(artifact.rootDir, script.mapPath)
        ) !== script.mapSha256)
    )
      throw new Error('Browser declaration output changed during conversion')
  }
  lease()
  return {
    version: 1,
    kind: 'next-compiler-declarations',
    source: { ...source },
    profile: { ...artifact.profile },
    compiler: {
      entryId: artifact.entryId,
      revision: artifact.revision,
      ...(retained.configurationImports && graph
        ? {
            configurationImports: {
              request: { ...retained.configurationImports },
              graph,
            },
          }
        : {}),
    },
    // Own the transport fields, including real Maps and infinite endpoints,
    // without retaining parser Position instances in the declaration DTO.
    data: structuredClone(data),
  }
}
