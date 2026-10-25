import { readFile, realpath } from 'fs/promises'
import { isAbsolute, resolve } from 'path'
import { isDeepStrictEqual } from 'util'
import {
  instrumentJavaScript,
  remapIstanbulCoverage,
} from '../../../compiled/next-test-instrumentation'
import { coverageHash, readArtifactFile, within } from './artifact'
import { assertIstanbulProfile } from './istanbul-profile'
import { assertIstanbulCjsSource } from './istanbul-cjs'
import { readIstanbulHarnessCoverage } from './istanbul-harness'
import { fileURLToPath } from 'url'
import type { CompiledTestArtifact } from '../contracts'
import type {
  IstanbulCoverageCapture,
  IstanbulInstrumentationMetadata,
  IstanbulRawFileCoverage,
  IstanbulStandardFileCoverage,
} from './istanbul-types'

/** JSON omits the actual instrumenter's undefined fallthrough coordinates. */
function wireBranchMap(value: IstanbulRawFileCoverage['branchMap']) {
  const map = structuredClone(value)
  for (const branch of Object.values(map))
    for (const location of branch.locations)
      for (const position of [location.start, location.end])
        for (const key of ['line', 'column'] as const)
          if (Object.hasOwn(position, key) && position[key] === undefined)
            delete position[key]
  return map
}

function wireInitial(value: IstanbulRawFileCoverage) {
  return { ...value, branchMap: wireBranchMap(value.branchMap) }
}

export async function assertIstanbulMetadata(
  metadata: IstanbulInstrumentationMetadata,
  projectDir: string,
  signal: AbortSignal
) {
  const root = await realpath(projectDir)
  if (
    metadata?.version !== 1 ||
    !Array.isArray(metadata.sources) ||
    ('importedOnly' in metadata && metadata.importedOnly !== true)
  )
    throw new Error('Missing Istanbul instrumentation metadata.')
  const seen = new Set<string>()
  for (const source of metadata.sources) {
    signal.throwIfAborted()
    if (
      !source ||
      typeof source.file !== 'string' ||
      !isAbsolute(source.file) ||
      resolve(source.file) !== source.file ||
      !within(root, source.file) ||
      !/\.(?:js|mjs|cjs)$/.test(source.file) ||
      seen.has(source.file) ||
      (await realpath(source.file)) !== source.file
    )
      throw new Error('Invalid Istanbul selected source.')
    seen.add(source.file)
    const bytes = await readFile(source.file, 'utf8')
    assertIstanbulCjsSource(bytes, source.file)
    if (
      coverageHash(bytes) !== source.sha256 ||
      !isDeepStrictEqual(
        wireInitial(instrumentJavaScript(bytes, source.file).initial),
        wireInitial(source.initial)
      )
    )
      throw new Error('Istanbul source or actual instrumenter map changed.')
  }
}

async function assertArtifact(
  artifact: CompiledTestArtifact,
  projectDir: string,
  signal: AbortSignal
) {
  assertIstanbulProfile(artifact.profile)
  const coverage = artifact.coverage
  if (
    artifact.kind !== 'node' ||
    coverage?.version !== 1 ||
    !coverage.istanbul ||
    coverage.sourceAnalysis ||
    coverage.sourcePreservation ||
    coverage.importRoles ||
    coverage.browser ||
    artifact.nativeTsConfigInputs ||
    artifact.moduleMocking ||
    artifact.moduleCache ||
    artifact.dynamicModuleMocking
  )
    throw new Error('Istanbul requires its isolated JavaScript artifact.')
  await assertIstanbulMetadata(coverage.istanbul, projectDir, signal)
  const harness = await readIstanbulHarnessCoverage({
    entryPath: artifact.entryPath,
    files: artifact.files,
    projectDir: await realpath(projectDir),
    setupFiles: artifact.setupFiles ?? [],
    snapshotSerializers: artifact.snapshotSerializers ?? [],
    signal,
    readArtifact: (path) => readArtifactFile(artifact.rootDir, path),
  })
  if (!isDeepStrictEqual(harness, coverage.istanbulHarness))
    throw new Error('Istanbul native harness metadata or requests changed.')
  for (const source of harness?.sources ?? []) {
    if (
      (Object.hasOwn(coverage.sources, source.source) &&
        coverage.sources[source.source] !== null) ||
      coverage.istanbul.sources.some(
        (authored) => authored.file === fileURLToPath(source.source)
      )
    )
      throw new Error(
        'Istanbul authored and generated harness sources are ambiguous.'
      )
  }
  for (const script of coverage.scripts) {
    signal.throwIfAborted()
    if (
      !artifact.files.includes(script.path) ||
      coverageHash(await readArtifactFile(artifact.rootDir, script.path)) !==
        script.sha256 ||
      (script.mapPath &&
        (!artifact.files.includes(script.mapPath) ||
          coverageHash(
            await readArtifactFile(artifact.rootDir, script.mapPath)
          ) !== script.mapSha256))
    )
      throw new Error('Istanbul emitted script or source map changed.')
  }
}

function validateCapture(
  capture: IstanbulCoverageCapture,
  metadata: IstanbulInstrumentationMetadata
) {
  if (
    capture?.version !== 1 ||
    capture.kind !== 'node-istanbul' ||
    !capture.files ||
    typeof capture.files !== 'object' ||
    Array.isArray(capture.files)
  )
    throw new Error('Missing actual Istanbul counter capture.')
  const sources = new Map(
    metadata.sources.map((source) => [source.file, source])
  )
  for (const [file, data] of Object.entries(capture.files)) {
    const initial = sources.get(file)?.initial
    if (!initial || !data || data.path !== file)
      throw new Error('Istanbul capture contains an unselected source.')
    for (const field of [
      'statementMap',
      'fnMap',
      'branchMap',
      'inputSourceMap',
    ] as const)
      if (
        !isDeepStrictEqual(
          field === 'branchMap' ? wireBranchMap(data[field]) : data[field],
          field === 'branchMap' ? wireBranchMap(initial[field]) : initial[field]
        )
      )
        throw new Error('Istanbul counter declarations or input map differ.')
    for (const metric of ['s', 'f', 'b'] as const) {
      const counts = data[metric]
      if (
        !counts ||
        typeof counts !== 'object' ||
        Array.isArray(counts) ||
        !isDeepStrictEqual(
          Object.keys(counts).sort(),
          Object.keys(initial[metric]).sort()
        )
      )
        throw new Error(
          'Istanbul counter keys differ from actual instrumentation.'
        )
      for (const [id, value] of Object.entries(counts)) {
        if (metric === 'b') {
          if (
            !Array.isArray(value) ||
            value.length !== initial.b[id].length ||
            value.some((count) => !Number.isSafeInteger(count) || count < 0)
          )
            throw new Error('Invalid actual Istanbul branch counters.')
        } else if (!Number.isSafeInteger(value) || (value as number) < 0)
          throw new Error('Invalid actual Istanbul counters.')
      }
    }
  }
}

/** Reset before bootstrap, read after cleanup; no inspector or V8 intervals. */
export async function startIstanbulCoverage(
  artifact: CompiledTestArtifact,
  projectDir: string
) {
  const signal = new AbortController().signal
  await assertArtifact(artifact, projectDir, signal)
  const global = globalThis as typeof globalThis & {
    __VITEST_COVERAGE__?: Record<string, IstanbulRawFileCoverage>
  }
  const previous = global.__VITEST_COVERAGE__
  if (previous) {
    for (const filename in previous) {
      const branches = previous[filename].b
      for (const key in branches) branches[key] = branches[key].map(() => 0)
      for (const metric of ['f', 's'] as const) {
        const entry = previous[filename][metric]
        for (const key in entry) entry[key] = 0
      }
    }
  }
  let stopped = false
  return {
    async stop(): Promise<IstanbulCoverageCapture> {
      if (stopped) throw new Error('Istanbul capture already stopped.')
      stopped = true
      const capture: IstanbulCoverageCapture = {
        version: 1,
        kind: 'node-istanbul',
        files: structuredClone(global.__VITEST_COVERAGE__ ?? {}),
      }
      validateCapture(capture, artifact.coverage!.istanbul!)
      return capture
    },
    async dispose() {},
  }
}

/** Actual counter remapping; zero maps come only from real instrumentation. */
export async function remapIstanbulCapture(
  artifact: CompiledTestArtifact,
  capture: IstanbulCoverageCapture,
  projectDir: string,
  signal: AbortSignal
): Promise<IstanbulStandardFileCoverage> {
  await assertArtifact(artifact, projectDir, signal)
  const metadata = artifact.coverage!.istanbul!
  validateCapture(capture, metadata)
  const sources = metadata.importedOnly
    ? metadata.sources.filter((source) =>
        Object.hasOwn(capture.files, source.file)
      )
    : metadata.sources
  const data = Object.fromEntries(
    sources.map((source) => [
      source.file,
      structuredClone(capture.files[source.file] ?? source.initial),
    ])
  )
  const remapped = await remapIstanbulCoverage(data)
  signal.throwIfAborted()
  return {
    version: 1,
    provider: 'istanbul',
    entryId: artifact.entryId,
    revision: artifact.revision,
    complete: true,
    errors: [],
    files: sources.flatMap((source) => {
      if (!remapped[source.file]) return []
      return [
        {
          file: source.file,
          sha256: source.sha256,
          data: remapped[source.file],
        },
      ]
    }),
  }
}
