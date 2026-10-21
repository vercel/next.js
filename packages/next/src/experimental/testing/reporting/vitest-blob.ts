import { constants } from 'node:fs'
import { mkdir, open, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, posix, resolve, win32 } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { ResultReporter } from './machine'
import { isCustomResultReporter, openCustomReporters } from './custom-reporter'
import { assertReporterTaskTree, type ReporterTaskSnapshot } from './live-tasks'

const VERSION = '5.0.4'
const MAX_BYTES = 16 * 1024 * 1024
const MAX_TABLE = 200000
const MAX_TASKS = 100000
const record = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const finite = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
const invalid = (message: string): never => {
  throw new Error(`Invalid Vitest ${VERSION} blob: ${message}`)
}

interface ForeignTask {
  id: string
  type: 'suite' | 'test'
  name: string
  fullName?: string
  fullTestName?: string
  mode: 'run' | 'skip' | 'todo' | 'queued'
  file: ForeignTask
  suite?: ForeignTask
  tasks?: ForeignTask[]
  meta: Record<string, unknown>
  tags?: string[]
  each?: boolean
  concurrent?: boolean
  shuffle?: boolean
  retry?: ReporterTaskSnapshot['retry']
  repeats?: number
  fails?: boolean
  timeout?: number
  annotations?: ReporterTaskSnapshot['annotations']
  artifacts?: ReporterTaskSnapshot['artifacts']
  benchmarks?: unknown[]
  location?: { file: string; line: number; column: number }
  filepath?: string
  projectName?: string
  pool?: string
  result?: {
    state: 'pass' | 'fail' | 'skip'
    startTime?: number
    duration?: number
    retryCount?: number
    repeatCount?: number
    errors?: { message: string; stack?: string }[]
  }
}
interface ImportedBlob {
  name: string
  digest: string
  table: unknown[]
  files: ForeignTask[]
  errors: { message: string; stack?: string }[]
  executionTime: number
}

/** Decode the published flatted string table as data, without loading its producer. */
export function decodeVitestBlob(text: string): {
  table: unknown[]
  value: unknown
} {
  let table: unknown
  try {
    table = JSON.parse(text)
  } catch {
    return invalid('malformed JSON string table')
  }
  if (!Array.isArray(table) || !table.length || table.length > MAX_TABLE)
    return invalid('missing or oversized string table')
  if (
    table.some((value) => typeof value === 'number' && !Number.isFinite(value))
  )
    return invalid('nonfinite string table number')
  const decoded = table.map((value) =>
    Array.isArray(value) ? [] : record(value) ? Object.create(null) : value
  )
  let fields = 0
  for (const [index, value] of table.entries()) {
    if (value !== null && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (++fields > 1000000) return invalid('oversized string table fields')
        if (typeof item === 'number' && !Number.isFinite(item))
          return invalid('nonfinite string table field')
        let resolved = item
        if (typeof item === 'string') {
          if (!/^(?:0|[1-9]\d*)$/.test(item))
            return invalid('non-reference nested string')
          const reference = Number(item)
          if (!Number.isSafeInteger(reference) || reference >= table.length)
            return invalid('string table reference escapes the table')
          resolved = decoded[reference]
        } else if (item !== null && typeof item === 'object') {
          return invalid('nested objects must use string table references')
        }
        Object.defineProperty(decoded[index], key, {
          value: resolved,
          writable: true,
          enumerable: true,
          configurable: true,
        })
      }
    }
  }
  return { table, value: decoded[0] }
}

function validPath(value: unknown, absolute: boolean): value is string {
  if (typeof value !== 'string' || !value || value.includes('\0')) return false
  if ((posix.isAbsolute(value) || win32.isAbsolute(value)) !== absolute)
    return false
  if (!value.replace(/\\/g, '/').split('/').at(-1)) return false
  return !value
    .replace(/\\/g, '/')
    .split('/')
    .some((part) => part === '.' || part === '..')
}
function validateErrors(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.some(
      (error) =>
        !record(error) ||
        typeof error.message !== 'string' ||
        (error.stack !== undefined && typeof error.stack !== 'string')
    )
  )
    return invalid('malformed error evidence')
}
function validateGraph(value: unknown) {
  if (!record(value)) return invalid('missing environment evidence')
  for (const project of Object.values(value)) {
    if (
      !record(project) ||
      !record(project.environments) ||
      !Array.isArray(project.external) ||
      project.external.some(
        (pair: unknown) =>
          !Array.isArray(pair) ||
          pair.length !== 2 ||
          pair.some((item) => typeof item !== 'string')
      )
    )
      return invalid('malformed opaque project graph')
    for (const graph of Object.values(project.environments)) {
      if (
        !record(graph) ||
        !Array.isArray(graph.idTable) ||
        graph.idTable.some((id: unknown) => typeof id !== 'string') ||
        !Array.isArray(graph.modules)
      )
        return invalid('malformed opaque environment graph')
      const index = (id: unknown) =>
        Number.isSafeInteger(id) &&
        (id as number) >= 0 &&
        (id as number) < graph.idTable.length
      for (const module of graph.modules)
        if (
          !Array.isArray(module) ||
          module.length !== 4 ||
          !module.slice(0, 3).every(index) ||
          !Array.isArray(module[3]) ||
          !module[3].every(index)
        )
          return invalid('opaque graph index escapes its table')
    }
  }
}
function importBlob(
  name: string,
  text: string,
  specifications: Set<string>,
  taskIdentities: Set<string>
): ImportedBlob {
  const { table, value } = decodeVitestBlob(text)
  if (!Array.isArray(value) || value.length !== 6 || value[0] !== VERSION)
    return invalid(
      `unsupported tuple or version in ${name}; expected ${VERSION}`
    )
  const [, files, errors, coverage, executionTime, environments] = value
  if (!Array.isArray(files) || !finite(executionTime))
    return invalid('malformed final files or execution time')
  validateErrors(errors)
  if (coverage !== null)
    throw new Error(
      'Vitest blob coverage merging is not implemented; its foreign coverage evidence is not a Next coverage result.'
    )
  validateGraph(environments)
  const visited = new Set<object>()
  for (const file of files) {
    if (
      !record(file) ||
      file.type !== 'suite' ||
      !validPath(file.filepath, true) ||
      !validPath(file.name, false) ||
      typeof file.projectName !== 'string' ||
      typeof file.pool !== 'string' ||
      !record(file.meta) ||
      (file.meta.typecheck !== undefined &&
        typeof file.meta.typecheck !== 'boolean') ||
      (file.meta.__vitest_label__ !== undefined &&
        typeof file.meta.__vitest_label__ !== 'string') ||
      !file.filepath
        .replace(/\\/g, '/')
        .endsWith('/' + file.name.replace(/\\/g, '/'))
    )
      return invalid('malformed or escaping file identity')
    const specification = JSON.stringify([
      file.projectName,
      file.name.replace(/\\/g, '/'),
      file.pool,
      file.meta?.typecheck ?? false,
      file.meta?.__vitest_label__ ?? '',
    ])
    if (specifications.has(specification))
      return invalid(`overlapping specification in ${name}`)
    specifications.add(specification)
    const ids = new Set<string>()
    const pending = [
      { task: file, parent: undefined as ForeignTask | undefined, depth: 0 },
    ]
    while (pending.length) {
      const { task, parent, depth } = pending.pop()!
      if (
        !record(task) ||
        visited.has(task) ||
        visited.size >= MAX_TASKS ||
        depth > 256
      )
        return invalid('cyclic, shared or oversized task ownership')
      visited.add(task)
      if (
        !['suite', 'test'].includes(task.type) ||
        typeof task.id !== 'string' ||
        !task.id ||
        ids.has(task.id) ||
        typeof task.name !== 'string' ||
        !['run', 'skip', 'todo', 'queued'].includes(task.mode) ||
        task.file !== file ||
        task.suite !== (parent === file ? undefined : parent) ||
        !record(task.meta) ||
        (task.tags !== undefined &&
          (!Array.isArray(task.tags) ||
            task.tags.some((tag: unknown) => typeof tag !== 'string'))) ||
        (task.benchmarks !== undefined && !Array.isArray(task.benchmarks))
      )
        return invalid('malformed task identity, links or metadata')
      if (taskIdentities.has(task.id))
        return invalid('ambiguous native task identity across specifications')
      taskIdentities.add(task.id)
      ids.add(task.id)
      if (
        task.location !== undefined &&
        (!record(task.location) ||
          !validPath(task.location.file, true) ||
          !Number.isSafeInteger(task.location.line) ||
          task.location.line < 1 ||
          !Number.isSafeInteger(task.location.column) ||
          task.location.column < 0)
      )
        return invalid('malformed original task location')
      const result = task.result
      if (result !== undefined) {
        if (!record(result) || !['pass', 'fail', 'skip'].includes(result.state))
          return invalid('incomplete or malformed final task result')
        for (const field of ['startTime', 'duration'])
          if (result[field] !== undefined && !finite(result[field]))
            return invalid('nonfinite final task timing')
        for (const field of ['retryCount', 'repeatCount'])
          if (
            result[field] !== undefined &&
            (!Number.isSafeInteger(result[field]) || result[field] < 0)
          )
            return invalid('malformed final retry/repeat counter')
        if (result.errors !== undefined) validateErrors(result.errors)
      } else if (task.mode !== 'skip' && task.mode !== 'todo') {
        return invalid(
          'incomplete task has no terminal result; pending imports need a separate adapter'
        )
      }
      if (task.type === 'suite') {
        if (!Array.isArray(task.tasks)) return invalid('missing suite children')
        for (let index = task.tasks.length - 1; index >= 0; index--)
          pending.push({
            task: task.tasks[index],
            parent: task as ForeignTask,
            depth: depth + 1,
          })
      } else if (task.tasks !== undefined)
        return invalid('test unexpectedly owns child tasks')
    }
  }
  return {
    name,
    digest: createHash('sha256').update(text).digest('hex'),
    table,
    files: files as ForeignTask[],
    errors,
    executionTime,
  }
}

function orderedImportedFiles(blobs: ImportedBlob[]) {
  return blobs
    .flatMap((blob) => blob.files)
    .sort(
      (left, right) =>
        (left.result?.startTime || 0) - (right.result?.startTime || 0)
    )
}

/** Capture actual native final declarations without inventing Next run events. */
function importedReporterTree(file: ForeignTask): ReporterTaskSnapshot {
  function visit(task: ForeignTask): ReporterTaskSnapshot {
    if (
      typeof task.fullName !== 'string' ||
      (task.fullTestName !== undefined && typeof task.fullTestName !== 'string')
    )
      return invalid('reporter replay requires native full-name facts')
    if (
      (['each', 'concurrent', 'shuffle', 'fails'] as const).some(
        (field) => task[field] !== undefined && typeof task[field] !== 'boolean'
      ) ||
      (task.timeout !== undefined && !finite(task.timeout)) ||
      (task.repeats !== undefined &&
        (!Number.isSafeInteger(task.repeats) || task.repeats < 0))
    )
      return invalid('reporter replay requires native declaration options')
    return {
      id: task.id,
      type: task.type,
      name: task.name,
      fullName: task.fullName,
      fullTestName: task.fullTestName,
      mode: task.mode,
      meta: task.meta,
      tags: task.tags!,
      each: task.each,
      concurrent: task.concurrent,
      shuffle: task.shuffle,
      retry: task.retry,
      repeats: task.repeats,
      fails: task.fails,
      timeout: task.timeout,
      result: task.result,
      ...(task.type === 'suite'
        ? { tasks: task.tasks!.map(visit) }
        : { annotations: task.annotations, artifacts: task.artifacts }),
      ...(task === file
        ? { filepath: file.filepath, projectName: file.projectName }
        : {}),
    }
  }
  const tree = visit(file)
  assertReporterTaskTree(tree, file.id)
  return tree
}

/** A foreign final-state projection deliberately does not emit Next execution events. */
function projectImportedBlobs(blobs: ImportedBlob[], started: number) {
  const files = orderedImportedFiles(blobs)
  const suites: ForeignTask[] = []
  const tests: { task: ForeignTask; ancestors: string[] }[] = []
  function visit(task: ForeignTask, ancestors: string[]) {
    if (task.type === 'test') tests.push({ task, ancestors })
    else {
      suites.push(task)
      for (const child of task.tasks!)
        visit(child, task === task.file ? ancestors : [...ancestors, task.name])
    }
  }
  for (const file of files) visit(file, [])
  const failedSuites = suites.filter(
    (suite) => suite.result?.state === 'fail'
  ).length
  const pendingSuites = suites.filter((suite) => suite.mode === 'todo').length
  const failedTests = tests.filter(
    ({ task }) => task.result?.state === 'fail'
  ).length
  const success = files.length > 0 && failedSuites === 0 && failedTests === 0
  return {
    numTotalTestSuites: suites.length,
    numPassedTestSuites: suites.length - failedSuites - pendingSuites,
    numFailedTestSuites: failedSuites,
    numPendingTestSuites: pendingSuites,
    numTotalTests: tests.length,
    numPassedTests: tests.filter(({ task }) => task.result?.state === 'pass')
      .length,
    numFailedTests: failedTests,
    numPendingTests: tests.filter(
      ({ task }) => task.mode === 'skip' || task.result?.state === 'skip'
    ).length,
    numTodoTests: tests.filter(({ task }) => task.mode === 'todo').length,
    snapshot: {
      added: 0,
      didUpdate: false,
      failure: false,
      filesAdded: 0,
      filesRemoved: 0,
      filesRemovedList: [],
      filesUnmatched: 0,
      filesUpdated: 0,
      matched: 0,
      total: 0,
      unchecked: 0,
      uncheckedKeysByFile: [],
      unmatched: 0,
      updated: 0,
    },
    startTime: started,
    success,
    testResults: files.map((file) => {
      const selected = tests.filter(({ task }) => task.file === file)
      const times = selected.flatMap(({ task }) =>
        task.result?.startTime === undefined ? [] : [task.result.startTime]
      )
      const startTime = times.reduce(
        (minimum, time) => Math.min(minimum, time),
        Infinity
      )
      const firstTime = startTime === Infinity ? started : startTime
      return {
        assertionResults: selected.map(({ task, ancestors }) => ({
          ancestorTitles: ancestors,
          fullName: task.name
            ? [...ancestors, task.name].join(' ')
            : ancestors.join(' '),
          status: {
            pass: 'passed',
            fail: 'failed',
            skip: 'skipped',
            todo: 'todo',
            run: 'pending',
            queued: 'pending',
          }[task.result?.state || task.mode],
          title: task.name,
          duration: task.result?.duration,
          failureMessages:
            task.result?.errors?.map((error) => error.stack || error.message) ??
            [],
          location: task.location,
          meta: task.meta,
          tags: task.tags ?? [],
          benchmarks: task.benchmarks ?? [],
        })),
        startTime: firstTime,
        endTime: selected.reduce(
          (end, { task }) =>
            Math.max(
              end,
              (task.result?.startTime ?? 0) + (task.result?.duration ?? 0)
            ),
          firstTime
        ),
        status:
          file.result?.state === 'fail' ||
          selected.some(({ task }) => task.result?.state === 'fail')
            ? 'failed'
            : 'passed',
        message: file.result?.errors?.[0]?.message ?? '',
        name: file.filepath,
      }
    }),
    vitest: {
      version: VERSION,
      evidence: 'foreign-final-task-graph',
      attemptHistory: 'unavailable',
      runBoundaries: 'unavailable',
      snapshotSummary: 'not-serialized',
      environmentGraphs: 'opaque-not-restored',
      blobs: blobs.map(({ name, digest, executionTime, table }) => ({
        name,
        sha256: digest,
        executionTime,
        flatted: table,
      })),
    },
  }
}

export async function tryMergeVitestBlobReports(
  input: string,
  names: string[],
  options: {
    projectDir: string
    reporters: readonly ResultReporter[]
    outputFile?: string
  }
): Promise<'passed' | 'failed' | undefined> {
  const sources: { name: string; text?: string; error?: unknown }[] = []
  let bytes = 0
  let foreign = false
  for (const name of names) {
    let handle
    try {
      handle = await open(
        resolve(input, name),
        // POSIX FIFOs must not wait for a writer before descriptor validation.
        // Flags unavailable on a platform contribute zero; this control is POSIX-only.
        constants.O_RDONLY |
          (constants.O_NOFOLLOW ?? 0) |
          (constants.O_NONBLOCK ?? 0)
      )
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size > MAX_BYTES)
        throw new Error(`Result blob is not a bounded regular file: ${name}`)
      const text = await handle.readFile('utf8')
      if (Buffer.byteLength(text) > MAX_BYTES)
        throw new Error(`Result blob grew beyond its limit: ${name}`)
      bytes += Buffer.byteLength(text)
      const candidate = text.trimStart().startsWith('[')
      foreign ||= candidate
      if (
        bytes > 64 * 1024 * 1024 &&
        (candidate || sources.some((source) => source.text))
      )
        throw new Error('Imported blob set exceeds its byte limit.')
      sources.push({ name, text: candidate ? text : '' })
    } catch (error) {
      foreign ||= name.endsWith('.blob')
      sources.push({ name, error })
    } finally {
      await handle?.close()
    }
  }
  if (!foreign) return undefined
  if (bytes > 64 * 1024 * 1024) return invalid('oversized imported blob set')
  if (
    options.reporters.filter((reporter) => reporter === 'json').length !== 1 ||
    options.reporters.some(
      (reporter) => reporter !== 'json' && !isCustomResultReporter(reporter)
    )
  )
    throw new Error(
      'Imported Vitest blob output requires the JSON reporter, optionally with JavaScript reporter paths; other foreign reporter adapters remain unimplemented.'
    )
  const specifications = new Set<string>()
  const digests = new Set<string>()
  const taskIdentities = new Set<string>()
  const blobs = sources.map(({ name, text, error }) => {
    if (error) throw error
    if (!text!.trimStart().startsWith('['))
      return invalid('cannot mix Next/unknown files with Vitest blobs')
    const blob = importBlob(name, text!, specifications, taskIdentities)
    if (digests.has(blob.digest)) return invalid('duplicate imported blob')
    digests.add(blob.digest)
    return blob
  })
  const report = projectImportedBlobs(blobs, Date.now())
  const errors = blobs.flatMap((blob) => blob.errors)
  const custom = options.reporters.filter(isCustomResultReporter)
  const adapterErrors: unknown[] = []
  if (custom.length) {
    // Complete validation and projection before loading any reporter.
    const files = orderedImportedFiles(blobs).map((file) => ({
      taskTree: importedReporterTree(file),
      relativeModuleId: file.name,
    }))
    const adapter = await openCustomReporters({
      projectDir: options.projectDir,
      reporters: custom,
      write: (text) => process.stdout.write(text),
      writeError: (text) => process.stderr.write(text),
    })
    try {
      for (const file of files)
        await adapter.replayImportedFile(file.taskTree, file.relativeModuleId)
      await adapter.finishImportedRun(
        files.map((file) => file.taskTree.id),
        errors,
        report.success ? 'passed' : 'failed'
      )
    } catch (error) {
      adapterErrors.push(error)
    } finally {
      try {
        await adapter.dispose()
      } catch (error) {
        adapterErrors.push(error)
      }
    }
  }
  const content = JSON.stringify(report, null, 2) + '\n'
  if (options.outputFile) {
    const target = resolve(options.projectDir, options.outputFile)
    await mkdir(dirname(target), { recursive: true })
    const temporary = `${target}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, content, { flag: 'wx' })
      await rename(temporary, target)
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
    }
  } else process.stdout.write(content)
  if (errors.length)
    process.stderr.write(
      errors.map((error) => error.stack || error.message).join('\n') + '\n'
    )
  for (const error of adapterErrors)
    process.stderr.write(
      (error instanceof Error ? error.stack || error.message : String(error)) +
        '\n'
    )
  return report.success && !errors.length && !adapterErrors.length
    ? 'passed'
    : 'failed'
}
