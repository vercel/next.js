import { readFile, realpath } from 'fs/promises'
import { resolve } from 'path'
import { isDeepStrictEqual } from 'util'
import {
  instrumentJavaScript,
  remapIstanbulCoverage,
  mergeIstanbulCoverage,
} from '../../../compiled/next-test-instrumentation'
import { assertIstanbulSourcePlan } from './istanbul-instrumentation'
import { coverageHash, within } from './artifact'
import {
  publishPreparedStandardCoverage,
  type PreparedCoverageMap,
} from './report-standard'
import type {
  IstanbulMappedFileCoverage,
  IstanbulSourcePlan,
  IstanbulStandardFileCoverage,
} from './istanbul-types'
import type { StandardCoverageOptions } from './types'

/** Only actual undefined fallthrough coordinates disappear on the JSON wire. */
function declarations(data: IstanbulMappedFileCoverage) {
  const { s: _s, f: _f, b: _b, ...value } = structuredClone(data)
  for (const branch of Object.values(value.branchMap))
    for (const location of branch.locations)
      for (const position of [location.start, location.end])
        for (const key of ['line', 'column'] as const)
          if (Object.hasOwn(position, key) && position[key] === undefined)
            delete position[key]
  return value
}

/** Separate provider facts never enter the V8 descriptor validator. */
export async function assertIstanbulCoverageFacts(options: {
  facts: unknown
  projectDir: string
  plan: IstanbulSourcePlan
  expected: ReadonlySet<string>
  revisions?: ReadonlyMap<string, string>
  signal: AbortSignal
}): Promise<IstanbulStandardFileCoverage[]> {
  await assertIstanbulSourcePlan(options.plan, options.signal)
  const root = await realpath(options.projectDir)
  if (options.plan.sources.some((source) => !within(root, source.file)))
    throw new Error('Istanbul selected source is outside its project.')
  if (!Array.isArray(options.facts))
    throw new Error('Missing Istanbul coverage facts.')
  const requested = new Set<string>()
  if (options.plan.importedOnly) {
    const candidates = new Set(
      options.plan.sources.map((source) => source.file)
    )
    for (const fact of options.facts) {
      if (!fact || !Array.isArray(fact.files))
        throw new Error('Missing loaded Istanbul coverage files.')
      for (const file of fact.files) {
        if (
          !file ||
          typeof file.file !== 'string' ||
          !candidates.has(file.file)
        )
          throw new Error(
            'Loaded Istanbul coverage contains an unplanned source.'
          )
        requested.add(file.file)
      }
    }
  }
  const sources = options.plan.importedOnly
    ? options.plan.sources.filter((source) => requested.has(source.file))
    : options.plan.sources
  const initial = Object.fromEntries(
    await Promise.all(
      sources.map(
        async (source) =>
          [
            source.file,
            instrumentJavaScript(
              await readFile(source.file, 'utf8'),
              source.file
            ).initial,
          ] as const
      )
    )
  )
  const maps = await remapIstanbulCoverage(initial)
  const selected = new Map(
    sources
      .filter((source) => maps[source.file])
      .map((source) => [source.file, source])
  )
  const entries = new Set<string>()
  for (const fact of options.facts) {
    options.signal.throwIfAborted()
    if (
      !fact ||
      fact.version !== 1 ||
      fact.provider !== 'istanbul' ||
      fact.complete !== true ||
      !Array.isArray(fact.errors) ||
      fact.errors.length ||
      typeof fact.entryId !== 'string' ||
      !options.expected.has(fact.entryId) ||
      entries.has(fact.entryId) ||
      typeof fact.revision !== 'string' ||
      !fact.revision ||
      (options.revisions &&
        options.revisions.get(fact.entryId) !== fact.revision) ||
      !Array.isArray(fact.files) ||
      (options.plan.importedOnly
        ? fact.files.length > selected.size
        : fact.files.length !== selected.size)
    )
      throw new Error(
        'Incomplete, duplicate or unrequested Istanbul coverage fact.'
      )
    entries.add(fact.entryId)
    const files = new Set<string>()
    for (const file of fact.files) {
      const source = selected.get(file?.file)
      if (
        !source ||
        files.has(file.file) ||
        file.sha256 !== source.sha256 ||
        !file.data ||
        file.data.path !== file.file ||
        !isDeepStrictEqual(
          declarations(file.data),
          declarations(maps[file.file])
        )
      )
        throw new Error(
          'Istanbul source or mapped declarations differ from actual instrumentation.'
        )
      files.add(file.file)
      for (const metric of ['s', 'f', 'b'] as const) {
        const counts = file.data[metric]
        if (
          !counts ||
          typeof counts !== 'object' ||
          Array.isArray(counts) ||
          !isDeepStrictEqual(
            Object.keys(counts).sort(),
            Object.keys(maps[file.file][metric]).sort()
          )
        )
          throw new Error('Istanbul mapped counter keys differ.')
        for (const [id, count] of Object.entries(counts)) {
          if (metric === 'b') {
            if (
              !Array.isArray(count) ||
              count.length !== maps[file.file].b[id].length ||
              count.some((value) => !Number.isSafeInteger(value) || value < 0)
            )
              throw new Error('Invalid Istanbul mapped branch counters.')
          } else if (!Number.isSafeInteger(count) || (count as number) < 0)
            throw new Error('Invalid Istanbul mapped counters.')
        }
      }
    }
  }
  if (entries.size !== options.expected.size)
    throw new Error('Istanbul coverage omitted an expected completed entry.')
  await assertIstanbulSourcePlan(options.plan, options.signal)
  return options.facts
}

/** Actual provider merge precedes the common reporter/threshold transaction. */
export async function publishIstanbulCoverage(options: {
  projectDir: string
  facts: IstanbulStandardFileCoverage[]
  plan: IstanbulSourcePlan
  expected: ReadonlySet<string>
  config: StandardCoverageOptions
  status: 'passed' | 'failed' | 'cancelled'
  signal: AbortSignal
  /** Private actual merged-map observer; independent of report-file policy. */
  onCoverageMap?: (map: PreparedCoverageMap) => void | Promise<void>
  /** Observe actual generation without running file reporters or thresholds. */
  prepareOnly?: true
}): Promise<
  Awaited<
    ReturnType<typeof import('./report-standard').publishStandardCoverage>
  >
> {
  options.signal.throwIfAborted()
  if (
    options.config.provider !== 'istanbul' ||
    options.config.formatterReports !== true
  )
    throw new Error(
      'Istanbul coverage requires its explicit provider and actual formatter.'
    )
  if (options.status === 'cancelled')
    throw new Error('Interrupted runs cannot publish Istanbul coverage.')
  if (options.prepareOnly !== undefined && options.prepareOnly !== true)
    throw new Error('Coverage preparation requires its explicit true option.')
  if (options.prepareOnly && typeof options.onCoverageMap !== 'function')
    throw new Error('Coverage preparation requires its actual map observer.')
  if (
    options.status !== 'passed' &&
    !options.config.reportOnFailure &&
    !options.onCoverageMap
  )
    return { published: false, thresholdErrors: [] }
  const facts = await assertIstanbulCoverageFacts(options)
  const root = await realpath(options.projectDir)
  const output = resolve(root, options.config.reportsDirectory)
  if (output === root || !within(root, output))
    throw new Error(
      'Istanbul coverage requires a dedicated report directory inside the project.'
    )
  const data = mergeIstanbulCoverage(
    // The pinned merger mutates its first input; closed captures stay immutable
    // when generation is followed by the later report-file transaction.
    structuredClone(
      facts.map((fact) =>
        Object.fromEntries(fact.files.map((file) => [file.file, file.data]))
      )
    )
  )
  const sources = new Map(
    options.plan.sources.map((source) => [source.file, source])
  )
  const files = new Map(
    Object.entries(data).map(([file, value]) => [
      file,
      { hash: sources.get(file)!.sha256, data: value },
    ])
  )
  // The shared transaction rechecks every source immediately before promotion.
  for (const [file, value] of files)
    if (coverageHash(await readFile(file)) !== value.hash)
      throw new Error('Istanbul coverage source changed before reporting.')
  return publishPreparedStandardCoverage({
    root,
    output,
    files,
    config: options.config,
    signal: options.signal,
    assertRuntime: () => assertIstanbulSourcePlan(options.plan, options.signal),
    ...(options.onCoverageMap
      ? {
          onCoverageMap: options.onCoverageMap,
          ...(options.prepareOnly ||
          (options.status !== 'passed' && !options.config.reportOnFailure)
            ? { skipPublication: true as const }
            : {}),
        }
      : {}),
  })
}
