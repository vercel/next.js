import {
  assertRuntimeConfigurationReceipts,
  assertRuntimeConfigurationPlan,
  type RuntimeConfigurationPlan,
  type RuntimeConfigurationReceipt,
} from './runtime-configuration'
import { isDeepStrictEqual, types } from 'util'
import {
  assertCompilerSourceCoverage,
  assertCoverageSourcePlan,
  type CoverageSourcePlan,
} from './source-analysis-plan'
import {
  lstat,
  readdir,
  readFile,
  realpath,
  mkdir,
  mkdtemp,
  writeFile,
  rename,
  rm,
  cp,
} from 'fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import { coverageHash, within } from './artifact'
import { createUncoveredSource } from './istanbul'
import { writeReports } from '../../../compiled/next-test-coverage'
import { standardCoverageSourceSelector } from './options'
import picomatch from 'next/dist/compiled/picomatch'
import type {
  CompilerSourceCoverage,
  StandardCoverageData,
  StandardCoverageLocation,
  StandardCoverageMetric,
  StandardCoverageOptions,
  StandardCoverageThresholdUpdate,
  StandardFileCoverage,
} from './types'

const metrics: StandardCoverageMetric[] = [
  'statements',
  'functions',
  'branches',
  'lines',
]

/** Configured clean is an actual pre-run action, including runs that fail. */
export async function prepareStandardCoverageDirectory(
  projectDir: string,
  config: StandardCoverageOptions,
  signal: AbortSignal
) {
  signal.throwIfAborted()
  const root = await realpath(projectDir)
  const output = resolve(root, config.reportsDirectory)
  if (output === root || !within(root, output))
    throw new Error(
      'Standard coverage reportsDirectory must be a dedicated directory inside the project.'
    )
  let current = root
  for (const part of relative(root, output).split(sep).filter(Boolean)) {
    current = join(current, part)
    try {
      const info = await lstat(current)
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error(
          'Standard coverage output must use regular directories.'
        )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
  }
  signal.throwIfAborted()
  await rm(output, { recursive: true, force: true })
}
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const count = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0
/** Converter metadata retains a genuine Map through advanced worker serialization. */
function functionNames(value: unknown): boolean {
  if (types.isMap(value)) {
    for (const [name, occurrences] of Map.prototype.entries.call(value))
      if (typeof name !== 'string' || !count(occurrences)) return false
    return true
  }
  return object(value) && Object.values(value).every(count)
}
const sameKeys = (left: object, right: object) =>
  JSON.stringify(Object.keys(left).sort()) ===
  JSON.stringify(Object.keys(right).sort())
const key = (location: {
  start: { line?: number; column?: number }
  end: { line?: number; column?: number }
}) =>
  [
    location.start.line,
    location.start.column,
    location.end.line,
    location.end.column,
  ]
    .map(String)
    .join(':')

function validateData(
  data: unknown,
  file: string,
  source: string
): asserts data is StandardCoverageData {
  if (!object(data) || data.path !== file)
    throw new Error(`Standard coverage path does not match its source: ${file}`)
  for (const field of ['statementMap', 'fnMap', 'branchMap', 's', 'f', 'b'])
    if (!object(data[field]))
      throw new Error(`Invalid standard coverage ${field}: ${file}`)
  if (
    !sameKeys(data.statementMap, data.s) ||
    !sameKeys(data.fnMap, data.f) ||
    !sameKeys(data.branchMap, data.b)
  )
    throw new Error(`Standard coverage maps and hits disagree: ${file}`)
  const lines = source.split('\n')
  function location(value: unknown, optional = false) {
    if (!object(value) || !object(value.start) || !object(value.end))
      throw new Error(`Invalid standard coverage location: ${file}`)
    if (
      optional &&
      [value.start, value.end].every((position) =>
        Object.keys(position).every(
          (field) =>
            ['line', 'column'].includes(field) && position[field] === undefined
        )
      )
    )
      return
    for (const [kind, position] of [
      ['start', value.start],
      ['end', value.end],
    ] as const) {
      if (
        !Number.isSafeInteger(position.line) ||
        position.line < 1 ||
        position.line > lines.length ||
        !(
          (Number.isSafeInteger(position.column) &&
            position.column >= 0 &&
            position.column <= lines[position.line - 1].length) ||
          (kind === 'end' && position.column === Infinity)
        )
      )
        throw new Error(
          `Standard coverage coordinate exceeds original source: ${file}`
        )
    }
    if (
      value.end.line < value.start.line ||
      (value.end.line === value.start.line &&
        value.end.column < value.start.column)
    )
      throw new Error(`Reversed standard coverage location: ${file}`)
  }
  for (const [id, range] of Object.entries(data.statementMap)) {
    location(range)
    if (!count(data.s[id]))
      throw new Error(`Invalid standard statement hits: ${file}`)
  }
  for (const [id, fn] of Object.entries(data.fnMap) as [string, any][]) {
    if (
      !object(fn) ||
      typeof fn.name !== 'string' ||
      !Number.isSafeInteger(fn.line) ||
      fn.line < 1 ||
      fn.line > lines.length
    )
      throw new Error(`Invalid standard function: ${file}`)
    location(fn.decl)
    location(fn.loc)
    if (!count(data.f[id]))
      throw new Error(`Invalid standard function hits: ${file}`)
  }
  for (const [id, branch] of Object.entries(data.branchMap) as [
    string,
    any,
  ][]) {
    if (
      !object(branch) ||
      typeof branch.type !== 'string' ||
      !Number.isSafeInteger(branch.line) ||
      branch.line < 1 ||
      branch.line > lines.length ||
      !Array.isArray(branch.locations) ||
      !Array.isArray(data.b[id]) ||
      branch.locations.length !== data.b[id].length ||
      !data.b[id].every(count)
    )
      throw new Error(`Invalid standard branch coverage: ${file}`)
    location(branch.loc)
    for (const range of branch.locations) location(range, true)
  }
  if (
    data.meta !== undefined &&
    (!object(data.meta) ||
      !object(data.meta.seen) ||
      !functionNames(data.meta.fnNames) ||
      ![
        data.meta.lastStatement,
        data.meta.lastFunction,
        data.meta.lastBranch,
      ].every(count) ||
      !Object.values(data.meta.seen).every(count))
  )
    throw new Error(`Invalid standard coverage metadata: ${file}`)
}

export interface StandardCoverageSourcePlans {
  sourcePlan: CoverageSourcePlan
  runtimeConfigurationPlan: RuntimeConfigurationPlan
}

/** Called after real process/group/compiler cleanup; producer IDs remain provisional until then. */
export async function assertStandardCoverageFacts(
  value: unknown,
  projectDir: string,
  expected: ReadonlySet<string>,
  revisions?: ReadonlyMap<string, string>,
  sourcePlans?: StandardCoverageSourcePlans,
  signal: AbortSignal = new AbortController().signal
): Promise<StandardFileCoverage[]> {
  if (!Array.isArray(value)) throw new Error('Missing standard coverage facts.')
  const root = await realpath(projectDir)
  const seen = new Set<string>()
  let plannedJsx = false
  async function assertPlans() {
    if (!sourcePlans) throw new Error('Missing planned JSX coverage ownership.')
    await assertCoverageSourcePlan(sourcePlans.sourcePlan, signal)
    await assertRuntimeConfigurationPlan(
      sourcePlans.runtimeConfigurationPlan,
      signal
    )
  }
  for (const fact of value) {
    if (
      !object(fact) ||
      fact.version !== 1 ||
      fact.complete !== true ||
      !Array.isArray(fact.errors) ||
      fact.errors.length ||
      typeof fact.entryId !== 'string' ||
      !expected.has(fact.entryId) ||
      seen.has(fact.entryId) ||
      typeof fact.revision !== 'string' ||
      !fact.revision ||
      (revisions && revisions.get(fact.entryId) !== fact.revision) ||
      !Array.isArray(fact.files)
    )
      throw new Error('Invalid or unowned standard coverage facts.')
    seen.add(fact.entryId)
    const seenFiles = new Set<string>()
    for (const file of fact.files) {
      if (
        !object(file) ||
        typeof file.file !== 'string' ||
        !isAbsolute(file.file) ||
        !within(root, file.file) ||
        file.file.split(sep).includes('node_modules') ||
        (!/\.[cm]?[jt]s$/.test(file.file) && !/\.[jt]sx$/.test(file.file)) ||
        typeof file.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(file.sha256)
      )
        throw new Error('Invalid standard coverage source ownership.')
      if (/\.[jt]sx$/.test(file.file)) {
        await assertPlans()
        const profiles = sourcePlans!.runtimeConfigurationPlan.requests.filter(
          (request) =>
            request.entries.some(
              (entry) =>
                entry.id === fact.entryId && entry.revision === fact.revision
            )
        )
        const sources = sourcePlans!.sourcePlan.requests.filter(
          (request) =>
            profiles.length === 1 &&
            isDeepStrictEqual(request.profile, profiles[0].profile) &&
            request.source.file === file.file &&
            request.source.sha256 === file.sha256
        )
        if (sources.length !== 1)
          throw new Error('Invalid planned JSX coverage source ownership.')
        plannedJsx = true
      }
      if (seenFiles.has(file.file))
        throw new Error('Duplicate standard coverage source within an entry.')
      seenFiles.add(file.file)
      if ((await realpath(file.file)) !== file.file)
        throw new Error('Standard coverage source is not canonical.')
      const source = await readFile(file.file, 'utf8')
      if (coverageHash(source) !== file.sha256)
        throw new Error(
          `Standard coverage source changed after capture: ${file.file}`
        )
      validateData(file.data, file.file, source)
    }
  }
  if (seen.size !== expected.size)
    throw new Error('Standard coverage omitted an expected test entry.')
  if (plannedJsx) await assertPlans()
  return value as StandardFileCoverage[]
}

function addHits(left: number, right: number) {
  const value = left + right
  if (!count(value))
    throw new Error(
      'Standard coverage hit count exceeds the safe integer range.'
    )
  return value
}

/** Merge by original declaration identity; generated numeric IDs can differ across entries. */
export function mergeStandardCoverageData(
  left: StandardCoverageData,
  right: StandardCoverageData
): StandardCoverageData {
  if (left.path !== right.path)
    throw new Error(
      'Cannot merge standard coverage from different source paths.'
    )
  const result = structuredClone(left)
  for (const [mapping, hits, identity] of [
    ['statementMap', 's', (value: StandardCoverageLocation) => key(value)],
    [
      'fnMap',
      'f',
      (value: StandardCoverageData['fnMap'][string]) => key(value.decl),
    ],
    [
      'branchMap',
      'b',
      (value: StandardCoverageData['branchMap'][string]) =>
        value.type + ':' + value.locations.map(key).join(':'),
    ],
  ] as const) {
    const target = result[mapping] as Record<string, any>
    const counters = result[hits] as Record<string, any>
    const ids = new Map(
      Object.entries(target).map(([id, value]) => [
        (identity as (value: any) => string)(value),
        id,
      ])
    )
    for (const [id, value] of Object.entries(right[mapping])) {
      const canonical = (identity as (value: any) => string)(value)
      const previous = ids.get(canonical)
      if (previous !== undefined) {
        if (JSON.stringify(target[previous]) !== JSON.stringify(value))
          throw new Error(
            'Conflicting original standard coverage declarations.'
          )
        counters[previous] =
          hits === 'b'
            ? counters[previous].map((n: number, index: number) =>
                addHits(n, right.b[id][index])
              )
            : addHits(
                counters[previous],
                (right[hits] as Record<string, number>)[id]
              )
      } else {
        const next = String(Object.keys(target).length)
        target[next] = structuredClone(value)
        counters[next] = structuredClone(right[hits][id])
        ids.set(canonical, next)
      }
    }
  }
  if (result.meta) {
    const seen: Record<string, number> = {}
    for (const [id, range] of Object.entries(result.statementMap))
      seen[`s:${key(range)}`] = Number(id)
    for (const [id, fn] of Object.entries(result.fnMap))
      seen[`f:${key(fn.decl)}`] = Number(id)
    for (const [id, branch] of Object.entries(result.branchMap))
      seen[`b:${branch.locations.map(key).join(':')}`] = Number(id)
    result.meta = {
      ...result.meta,
      lastStatement: Object.keys(result.s).length,
      lastFunction: Object.keys(result.f).length,
      lastBranch: Object.keys(result.b).length,
      seen,
    }
  }
  return result
}

function lineHits(data: StandardCoverageData) {
  const lines = new Map<number, number>()
  for (const [id, range] of Object.entries(data.statementMap))
    lines.set(
      range.start.line,
      Math.max(lines.get(range.start.line) ?? 0, data.s[id])
    )
  return lines
}

export function standardCoverageSummary(
  files: Record<string, StandardCoverageData>
) {
  const values: Record<StandardCoverageMetric, number[]> = {
    statements: [],
    functions: [],
    branches: [],
    lines: [],
  }
  for (const data of Object.values(files)) {
    values.statements.push(...Object.values(data.s))
    values.functions.push(...Object.values(data.f))
    values.branches.push(...Object.values(data.b).flat())
    values.lines.push(...lineHits(data).values())
  }
  return Object.fromEntries(
    metrics.map((metric) => {
      const total = values[metric].length
      const covered = values[metric].filter((value) => value > 0).length
      // Empty metric sets are fully covered, as in Istanbul summaries.
      return [
        metric,
        {
          total,
          covered,
          percent: total ? Math.floor((covered / total) * 10000) / 100 : 100,
        },
      ]
    })
  ) as Record<
    StandardCoverageMetric,
    { total: number; covered: number; percent: number }
  >
}

export function standardCoverageJsonSummary(
  files: Record<string, StandardCoverageData>,
  total = standardCoverageSummary(files)
) {
  const summarize = (
    summary: ReturnType<typeof standardCoverageSummary>,
    empty = false
  ) =>
    Object.fromEntries(
      metrics.map((metric) => [
        metric,
        {
          total: summary[metric].total,
          covered: summary[metric].covered,
          skipped: 0,
          pct: empty ? 'Unknown' : summary[metric].percent,
        },
      ])
    )
  return {
    total: {
      ...summarize(total, Object.keys(files).length === 0),
      branchesTrue: { total: 0, covered: 0, skipped: 0, pct: 'Unknown' },
    },
    ...Object.fromEntries(
      Object.entries(files).map(([file, data]) => [
        file,
        summarize(standardCoverageSummary({ [file]: data })),
      ])
    ),
  }
}

export function standardCoverageTextSummary(
  files: Record<string, StandardCoverageData>,
  summary = standardCoverageSummary(files)
): string {
  const empty = Object.keys(files).length === 0
  const lines = [
    '',
    '=============================== Coverage summary ===============================',
  ]
  for (const metric of [
    'statements',
    'branches',
    'functions',
    'lines',
  ] as const) {
    const value = summary[metric]
    const label = metric[0].toUpperCase() + metric.slice(1)
    lines.push(
      `${label.padEnd(13)}: ${empty ? 'Unknown' : value.percent}% ( ${value.covered}/${value.total} )`
    )
  }
  lines.push(
    '================================================================================',
    ''
  )
  return lines.join('\n')
}

export function standardCoverageLcov(
  files: Record<string, StandardCoverageData>,
  root: string
) {
  const output: string[] = []
  for (const data of Object.values(files)) {
    output.push('TN:', `SF:${relative(root, data.path).split(sep).join('/')}`)
    for (const fn of Object.values(data.fnMap))
      output.push(`FN:${fn.loc.start.line},${fn.name}`)
    output.push(
      `FNF:${Object.keys(data.f).length}`,
      `FNH:${Object.values(data.f).filter((n) => n > 0).length}`
    )
    for (const [id, fn] of Object.entries(data.fnMap))
      output.push(`FNDA:${data.f[id]},${fn.name}`)
    const lines = [...lineHits(data)].sort(([a], [b]) => a - b)
    for (const [line, hits] of lines) output.push(`DA:${line},${hits}`)
    output.push(
      `LF:${lines.length}`,
      `LH:${lines.filter(([, n]) => n > 0).length}`
    )
    for (const [id, branch] of Object.entries(data.branchMap))
      for (const [index, hits] of data.b[id].entries())
        output.push(`BRDA:${branch.line},${id},${index},${hits}`)
    const hits = Object.values(data.b).flat()
    output.push(
      `BRF:${hits.length}`,
      `BRH:${hits.filter((n) => n > 0).length}`,
      'end_of_record'
    )
  }
  return output.join('\n') + '\n'
}

/** All capture writers and worker/compiler owners close before publication. */
export async function publishStandardCoverage(options: {
  projectDir: string
  facts: StandardFileCoverage[]
  expected: ReadonlySet<string>
  excludedFiles: readonly string[]
  config: StandardCoverageOptions
  status: 'passed' | 'failed' | 'cancelled'
  /** Parent scheduling evidence; partial watch reruns omit unimported sources. */
  includeUnimported?: boolean
  /** Parent-authorized actual compiler declaration analyses, separate from captures. */
  sourceAnalysis?: { facts: CompilerSourceCoverage[]; plan: CoverageSourcePlan }
  runtimeConfiguration?: {
    receipts: readonly RuntimeConfigurationReceipt[]
    /** Previously closed captures, issued only by the watch generation cache. */
    retainedEntryIds?: ReadonlySet<string>
    plan?: RuntimeConfigurationPlan
  }
  signal?: AbortSignal
}): Promise<{
  published: boolean
  thresholdErrors: string[]
  summary?: ReturnType<typeof standardCoverageSummary>
  thresholdUpdates?: StandardCoverageThresholdUpdate[]
  textSummary?: string
  files?: string[]
}> {
  const { config, signal } = options
  signal?.throwIfAborted()
  if (options.status === 'cancelled')
    throw new Error('Interrupted runs cannot publish standard coverage.')
  if (options.status !== 'passed' && !config.reportOnFailure)
    return { published: false, thresholdErrors: [] }
  await assertStandardCoverageFacts(
    options.facts,
    options.projectDir,
    options.expected,
    undefined,
    options.sourceAnalysis && options.runtimeConfiguration?.plan
      ? {
          sourcePlan: options.sourceAnalysis.plan,
          runtimeConfigurationPlan: options.runtimeConfiguration.plan,
        }
      : undefined,
    signal
  )
  const root = await realpath(options.projectDir)
  const analysisSignal = signal ?? new AbortController().signal
  const assertRuntime = () =>
    options.runtimeConfiguration
      ? assertRuntimeConfigurationReceipts({
          ...options.runtimeConfiguration,
          facts: options.facts,
          signal: analysisSignal,
        })
      : Promise.resolve()
  await assertRuntime()
  const analyses = options.sourceAnalysis
    ? await assertCompilerSourceCoverage(
        options.sourceAnalysis.facts,
        options.sourceAnalysis.plan,
        analysisSignal
      )
    : []
  const declarations = new Map(analyses.map((fact) => [fact.source.file, fact]))
  const selected = standardCoverageSourceSelector(root, config)
  const excluded = new Set(options.excludedFiles)
  const output = resolve(root, config.reportsDirectory)
  if (output === root || !within(root, output))
    throw new Error(
      'Standard coverage reportsDirectory must be a dedicated directory inside the project.'
    )
  const files = new Map<string, { hash: string; data: StandardCoverageData }>()
  for (const fact of options.facts)
    for (const file of fact.files) {
      if (!selected(file.file) || excluded.has(file.file)) continue
      const declaration = declarations.get(file.file)
      if (
        options.sourceAnalysis &&
        config.include &&
        options.includeUnimported !== false &&
        !/\.[cm]?js$/.test(file.file) &&
        !declaration
      )
        throw new Error(
          `Selected typed coverage source was not authorized by the parent analysis: ${file.file}`
        )
      if (
        declaration &&
        (declaration.source.sha256 !== file.sha256 ||
          // Both facts are serialized coverage dictionaries; preserve every
          // descriptor/ID/metadata value across parent and IPC object realms.
          !isDeepStrictEqual(
            structuredClone({
              ...file.data,
              s: declaration.data.s,
              f: declaration.data.f,
              b: declaration.data.b,
            }),
            structuredClone(declaration.data)
          ))
      )
        throw new Error(
          `Runtime and compiler analysis disagree on original coverage descriptors: ${file.file}`
        )
      const previous = files.get(file.file)
      if (previous && previous.hash !== file.sha256)
        throw new Error(
          'Original source changed between standard coverage entries.'
        )
      files.set(file.file, {
        hash: file.sha256,
        data: previous
          ? mergeStandardCoverageData(previous.data, file.data)
          : structuredClone(file.data),
      })
    }
  for (const fact of analyses) {
    if (!selected(fact.source.file) || excluded.has(fact.source.file))
      throw new Error(
        'Compiler source analysis is outside the final coverage selection'
      )
    validateData(
      fact.data,
      fact.source.file,
      await readFile(fact.source.file, 'utf8')
    )
  }
  if (config.include && options.includeUnimported !== false) {
    async function visit(dir: string) {
      for (const item of await readdir(dir, { withFileTypes: true })) {
        signal?.throwIfAborted()
        const file = join(dir, item.name)
        if (
          item.name.startsWith('.') ||
          item.name === 'node_modules' ||
          file === output
        )
          continue
        if (item.isDirectory()) await visit(file)
        else if (
          item.isFile() &&
          selected(file) &&
          !excluded.has(file) &&
          !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file) &&
          /\.[cm]?[jt]sx?$/.test(file) &&
          !files.has(file)
        ) {
          const canonical = await realpath(file)
          if (canonical !== file || !within(root, canonical))
            throw new Error(
              'Unimported standard coverage source escapes the project.'
            )
          const source = await readFile(file, 'utf8')
          files.set(file, {
            hash: coverageHash(source),
            data: declarations.has(file)
              ? structuredClone(declarations.get(file)!.data)
              : await createUncoveredSource(file, source),
          })
        }
      }
    }
    await visit(root)
  }
  const data = Object.fromEntries(
    [...files]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, value]) => [file, value.data])
  )
  const summary = standardCoverageSummary(data)
  const thresholdGroups: {
    file?: string
    summary: ReturnType<typeof standardCoverageSummary>
  }[] = config.thresholds.perFile
    ? Object.keys(data)
        .sort()
        .map((file) => ({
          file,
          summary: standardCoverageSummary({ [file]: data[file] }),
        }))
    : [{ summary }]
  // The configured formatter uses the reference reporter's percentage order.
  // Legacy CLI, per-file and uncovered-count diagnostics keep their own paths.
  const configuredGlobalPercentages =
    config.formatterReports &&
    metrics.every(
      (metric) =>
        (config.thresholds[100] ? 100 : (config.thresholds[metric] ?? 0)) >= 0
    )
  const thresholdMetrics: StandardCoverageMetric[] = configuredGlobalPercentages
    ? ['lines', 'functions', 'statements', 'branches']
    : metrics
  const thresholdErrors = thresholdGroups.flatMap(
    ({ file, summary: group }) => {
      const suffix = file
        ? ` for ${relative(root, file).split(sep).join('/')}`
        : ''
      return thresholdMetrics.flatMap((metric) => {
        const threshold = config.thresholds[100]
          ? 100
          : config.thresholds[metric]
        if (threshold === undefined) return []
        if (threshold < 0) {
          const uncovered = group[metric].total - group[metric].covered
          return uncovered > -threshold
            ? [
                `Uncovered ${metric} (${uncovered}) exceed global threshold (${-threshold})${suffix}`,
              ]
            : []
        }
        return group[metric].percent < threshold
          ? [
              `Coverage for ${metric} (${group[metric].percent}%) does not meet global threshold (${threshold}%)${suffix || (configuredGlobalPercentages ? '' : '.')}`,
            ]
          : []
      })
    }
  )
  for (const { pattern, thresholds } of config.thresholdGroups ?? []) {
    const matches = picomatch(pattern)
    const matchingFiles = Object.keys(data)
      .sort()
      .filter((file) => matches(relative(root, file).split(sep).join('/')))
    if (!matchingFiles.length) continue
    const groups = thresholds.perFile
      ? matchingFiles.map((file) => ({ file, data: { [file]: data[file] } }))
      : [
          {
            file: undefined,
            data: Object.fromEntries(
              matchingFiles.map((file) => [file, data[file]])
            ),
          },
        ]
    for (const group of groups) {
      const values = standardCoverageSummary(group.data)
      const suffix = group.file
        ? ` for ${relative(root, group.file).split(sep).join('/')}`
        : ''
      for (const metric of [
        'lines',
        'functions',
        'statements',
        'branches',
      ] as const) {
        const threshold = thresholds[100] ? 100 : thresholds[metric]
        if (threshold === undefined) continue
        if (threshold < 0) {
          const uncovered = values[metric].total - values[metric].covered
          if (uncovered > -threshold)
            thresholdErrors.push(
              `Uncovered ${metric} (${uncovered}) exceed "${pattern}" threshold (${-threshold})${suffix}`
            )
        } else if (values[metric].percent < threshold)
          thresholdErrors.push(
            `Coverage for ${metric} (${values[metric].percent}%) does not meet "${pattern}" threshold (${threshold}%)${suffix}`
          )
      }
    }
  }
  const thresholdUpdates = config.thresholds.autoUpdate
    ? ([] as StandardCoverageThresholdUpdate[])
    : undefined
  const improveThresholds = (
    thresholds: StandardCoverageOptions['thresholds'],
    summaries: (typeof summary)[],
    pattern?: string
  ) => {
    if (!thresholdUpdates || !summaries.length) return
    for (const metric of [
      'lines',
      'functions',
      'statements',
      'branches',
    ] as const) {
      const previous = thresholds[100] ? 100 : (thresholds[metric] ?? 100)
      if (previous >= 0) {
        const value = Math.min(
          ...summaries.map((group) => group[metric].percent)
        )
        if (value > previous)
          thresholdUpdates.push({
            metric,
            previous,
            value,
            ...(pattern ? { pattern } : {}),
          })
      } else {
        const uncovered = Math.max(
          ...summaries.map(
            (group) => group[metric].total - group[metric].covered
          )
        )
        if (uncovered < -previous)
          thresholdUpdates.push({
            metric,
            previous,
            value: uncovered === 0 ? 100 : -uncovered,
            ...(pattern ? { pattern } : {}),
          })
      }
    }
  }
  // An empty coverage map has Unknown aggregate percentages in Istanbul.
  if (Object.keys(data).length)
    improveThresholds(
      config.thresholds,
      thresholdGroups.map((group) => group.summary)
    )
  for (const { pattern, thresholds } of config.thresholdGroups ?? []) {
    const matches = picomatch(pattern)
    const matching = Object.keys(data).filter((file) =>
      matches(relative(root, file).split(sep).join('/'))
    )
    if (!matching.length) continue
    improveThresholds(
      thresholds,
      thresholds.perFile
        ? matching.map((file) =>
            standardCoverageSummary({ [file]: data[file] })
          )
        : [
            standardCoverageSummary(
              Object.fromEntries(matching.map((file) => [file, data[file]]))
            ),
          ],
      pattern
    )
  }
  const artifacts: Record<string, string> = {}
  if (config.reporter.includes('json'))
    artifacts['coverage-final.json'] = JSON.stringify(data, null, 2) + '\n'
  if (config.reporter.includes('json-summary'))
    artifacts['coverage-summary.json'] =
      JSON.stringify(standardCoverageJsonSummary(data, summary), null, 2) + '\n'
  if (config.reporter.includes('lcov') || config.reporter.includes('lcovonly'))
    artifacts['lcov.info'] = standardCoverageLcov(data, root)
  // Only a dedicated generated report directory may be replaced. Never follow
  // symlinks or recursively replace a directory containing unrelated source.
  let parent = root
  for (const part of relative(root, dirname(output))
    .split(sep)
    .filter(Boolean)) {
    parent = join(parent, part)
    try {
      await mkdir(parent)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    const stat = await lstat(parent)
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (await realpath(parent)) !== parent
    )
      throw new Error(
        'Standard coverage report parent escapes the project or follows a symlink.'
      )
  }
  let existed = false
  try {
    const stat = await lstat(output)
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error(
        'Standard coverage output is not a regular dedicated directory.'
      )
    if (config.formatterReports) {
      async function assertRegularEntries(directory: string) {
        for (const item of await readdir(directory, { withFileTypes: true })) {
          if (item.isDirectory())
            await assertRegularEntries(join(directory, item.name))
          else if (!item.isFile())
            throw new Error(
              'Standard coverage directory contains a nonregular entry.'
            )
        }
      }
      await assertRegularEntries(output)
    } else
      for (const item of await readdir(output, { withFileTypes: true }))
        if (
          !item.isFile() ||
          ![
            'coverage-final.json',
            'coverage-summary.json',
            'lcov.info',
          ].includes(item.name)
        )
          throw new Error(
            'Standard coverage directory contains an unrelated file.'
          )
    existed = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const staging = await mkdtemp(join(dirname(output), '.next-test-coverage-'))
  const backup = staging + '-previous'
  let displaced = false
  let published = false
  let formatterText: string | undefined
  let reportFiles = Object.keys(artifacts)
  try {
    if (config.formatterReports) {
      if (existed) await cp(output, staging, { recursive: true })
      formatterText = await writeReports(
        data,
        staging,
        config.reporter,
        config.reporterOptions
      )
      reportFiles = []
      async function collect(directory: string) {
        for (const item of await readdir(directory, { withFileTypes: true })) {
          const file = join(directory, item.name)
          if (item.isDirectory()) await collect(file)
          else if (item.isFile()) reportFiles.push(relative(staging, file))
        }
      }
      await collect(staging)
      reportFiles.sort()
    } else {
      for (const [name, value] of Object.entries(artifacts))
        await writeFile(join(staging, name), value, { flag: 'wx', signal })
    }
    await assertRuntime()
    // Recheck all source bytes after unimported discovery and before committing.
    for (const [file, value] of files)
      if (coverageHash(await readFile(file)) !== value.hash)
        throw new Error(
          `Standard coverage source changed before publication: ${file}`
        )
    if (options.sourceAnalysis)
      await assertCompilerSourceCoverage(
        options.sourceAnalysis.facts,
        options.sourceAnalysis.plan,
        analysisSignal
      )
    signal?.throwIfAborted()
    // Stdout-only formatters complete without creating a report directory.
    if (!config.formatterReports || reportFiles.length) {
      if (existed) {
        await rename(output, backup)
        displaced = true
      }
      signal?.throwIfAborted()
      await rename(staging, output)
      published = true
    }
    await assertRuntime()
    if (options.sourceAnalysis)
      await assertCompilerSourceCoverage(
        options.sourceAnalysis.facts,
        options.sourceAnalysis.plan,
        analysisSignal
      )
    // A queued rename can complete after cancellation. Keep the previous
    // report recoverable until this transaction confirms the committed output.
    signal?.throwIfAborted()
  } catch (error) {
    try {
      if (published) {
        await rename(output, staging)
        published = false
      }
      if (displaced) await rename(backup, output)
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'Standard coverage publication rollback failed.'
      )
    }
    throw error
  } finally {
    if (!published) await rm(staging, { recursive: true, force: true })
  }
  if (displaced) await rm(backup, { recursive: true, force: true })
  return {
    published: true,
    summary,
    thresholdErrors,
    ...(thresholdUpdates ? { thresholdUpdates } : {}),
    textSummary: config.formatterReports
      ? formatterText
      : config.reporter.includes('text-summary')
        ? standardCoverageTextSummary(data, summary)
        : undefined,
    files: reportFiles.map((name) => join(output, name)),
  }
}
