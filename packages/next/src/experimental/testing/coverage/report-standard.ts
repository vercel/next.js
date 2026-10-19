import {
  assertRuntimeConfigurationReceipts,
  type RuntimeConfigurationPlan,
  type RuntimeConfigurationReceipt,
} from './runtime-configuration'
import { isDeepStrictEqual, types } from 'util'
import {
  assertCompilerSourceCoverage,
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
} from 'fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import { coverageHash, within } from './artifact'
import { createUncoveredSource } from './istanbul'
import { standardCoverageSourceSelector } from './options'
import type {
  CompilerSourceCoverage,
  StandardCoverageData,
  StandardCoverageLocation,
  StandardCoverageMetric,
  StandardCoverageOptions,
  StandardFileCoverage,
} from './types'

const metrics: StandardCoverageMetric[] = [
  'statements',
  'functions',
  'branches',
  'lines',
]
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

/** Called after real process/group/compiler cleanup; producer IDs remain provisional until then. */
export async function assertStandardCoverageFacts(
  value: unknown,
  projectDir: string,
  expected: ReadonlySet<string>,
  revisions?: ReadonlyMap<string, string>
): Promise<StandardFileCoverage[]> {
  if (!Array.isArray(value)) throw new Error('Missing standard coverage facts.')
  const root = await realpath(projectDir)
  const seen = new Set<string>()
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
        !/\.[cm]?[jt]s$/.test(file.file) ||
        typeof file.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(file.sha256)
      )
        throw new Error('Invalid standard coverage source ownership.')
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
    plan?: RuntimeConfigurationPlan
  }
  signal?: AbortSignal
}) {
  const { config, signal } = options
  signal?.throwIfAborted()
  if (options.status === 'cancelled')
    throw new Error('Interrupted runs cannot publish standard coverage.')
  if (options.status !== 'passed' && !config.reportOnFailure)
    return { published: false, thresholdErrors: [] }
  await assertStandardCoverageFacts(
    options.facts,
    options.projectDir,
    options.expected
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
  const thresholdErrors = metrics.flatMap((metric) =>
    config.thresholds[metric] !== undefined &&
    summary[metric].percent < config.thresholds[metric]!
      ? [
          `Coverage for ${metric} (${summary[metric].percent}%) does not meet global threshold (${config.thresholds[metric]}%).`,
        ]
      : []
  )
  const artifacts: Record<string, string> = {}
  if (config.reporter.includes('json'))
    artifacts['coverage-final.json'] = JSON.stringify(data, null, 2) + '\n'
  if (config.reporter.includes('lcov'))
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
    for (const item of await readdir(output, { withFileTypes: true }))
      if (
        !item.isFile() ||
        !['coverage-final.json', 'lcov.info'].includes(item.name)
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
  try {
    for (const [name, value] of Object.entries(artifacts))
      await writeFile(join(staging, name), value, { flag: 'wx', signal })
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
    if (existed) {
      await rename(output, backup)
      displaced = true
    }
    signal?.throwIfAborted()
    await rename(staging, output)
    published = true
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
    files: Object.keys(artifacts).map((name) => join(output, name)),
  }
}
