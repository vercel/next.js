import { assertReporterTaskTree, type ReporterTaskSnapshot } from './live-tasks'
import { randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { isDeepStrictEqual, stripVTControlCharacters } from 'node:util'
import type {
  CaseResult,
  FileResult,
  SuiteResult,
  ResultEvent,
  SerializedDiagnostic,
} from './events'
import type { TestEntry } from '../contracts'
import type { PreparedCoverageMap } from '../coverage/report-standard'
import {
  isReportedSuiteError,
  type CustomReporterCompletion,
} from './custom-reporter-tasks'
import {
  createTestReporter,
  formatDiagnostic,
  type TestReporterOptions,
} from './reporter'
import { renderTapReport, writeGithubActionsReport } from './builtin-reporters'
import { orderTestDeclarations, orderTestSpecifications } from './task-order'
import { isCustomResultReporter, openCustomReporters } from './custom-reporter'
import { tryMergeVitestBlobReports } from './vitest-blob'
export { isCustomResultReporter } from './custom-reporter'

type CustomResultReporter = string & {
  readonly __customResultReporter: unique symbol
}

export type ResultReporter =
  | 'default'
  | 'verbose'
  | 'dot'
  | 'tap'
  | 'tap-flat'
  | 'github-actions'
  | 'json'
  | 'junit'
  | 'blob'
  | CustomResultReporter

export function isMachineResultReporter(
  reporter: ResultReporter
): reporter is 'json' | 'junit' | 'blob' {
  return reporter === 'json' || reporter === 'junit' || reporter === 'blob'
}

export function parseResultReporters(
  names?: readonly string[]
): ResultReporter[] {
  const reporters = names ?? ['default']
  if (!reporters.length || new Set(reporters).size !== reporters.length) {
    throw new Error(
      'Result reporters must be a nonempty list without duplicates.'
    )
  }
  for (const name of reporters) {
    if (
      ![
        'default',
        'verbose',
        'dot',
        'tap',
        'tap-flat',
        'github-actions',
        'json',
        'junit',
        'blob',
      ].includes(name) &&
      !isCustomResultReporter(name)
    ) {
      throw new Error(
        `Unsupported result reporter "${name}". Available: default, verbose, dot, tap, tap-flat, github-actions, json, junit, blob, or a custom reporter file or package. Advanced custom reporter adapters remain unimplemented.`
      )
    }
  }
  return [...reporters] as ResultReporter[]
}

function xml(value: unknown): string {
  return (
    stripVTControlCharacters(String(value))
      // XML 1.0 cannot represent these controls, including in CDATA.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  )
}

function validAnnotation(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const annotation = value as Record<string, unknown>
  if (
    typeof annotation.message !== 'string' ||
    typeof annotation.type !== 'string'
  )
    return false
  if (annotation.location !== undefined) {
    const location = annotation.location as Record<string, unknown>
    if (
      !location ||
      typeof location.file !== 'string' ||
      !Number.isSafeInteger(location.line) ||
      (location.line as number) < 1 ||
      !Number.isSafeInteger(location.column) ||
      (location.column as number) < 1
    )
      return false
  }
  if (annotation.attachment !== undefined) {
    const attachment = annotation.attachment as Record<string, unknown>
    if (
      !attachment ||
      typeof attachment !== 'object' ||
      Array.isArray(attachment) ||
      (attachment.path !== undefined && typeof attachment.path !== 'string') ||
      (attachment.body !== undefined && typeof attachment.body !== 'string') ||
      (attachment.contentType !== undefined &&
        typeof attachment.contentType !== 'string') ||
      (attachment.bodyEncoding !== undefined &&
        !['base64', 'utf-8'].includes(attachment.bodyEncoding as string)) ||
      (attachment.body == null && !attachment.path) ||
      (attachment.body && attachment.path) ||
      (attachment.path && attachment.bodyEncoding)
    )
      return false
  }
  return true
}

function validArtifact(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const artifact = value as Record<string, unknown>
  if (typeof artifact.type !== 'string') return false
  if (
    !validAnnotation({
      message: '',
      type: artifact.type,
      location: artifact.location,
    })
  )
    return false
  return (
    artifact.attachments === undefined ||
    (Array.isArray(artifact.attachments) &&
      artifact.attachments.every((attachment) => {
        // Normalization adds the default encoding to an allowed empty body/path pair.
        const normalized =
          attachment &&
          attachment.body === '' &&
          attachment.path &&
          attachment.bodyEncoding === 'base64'
            ? { ...attachment, bodyEncoding: undefined }
            : attachment
        return validAnnotation({
          message: '',
          type: artifact.type,
          attachment: normalized,
        })
      }))
  )
}

function validDiagnostic(value: unknown): boolean {
  const pending: unknown[] = [value]
  let visited = 0
  while (pending.length) {
    if (++visited > 1024) return false
    const diagnostic = pending.pop() as any
    if (
      !diagnostic ||
      typeof diagnostic !== 'object' ||
      typeof diagnostic.message !== 'string' ||
      !['error', 'warning'].includes(diagnostic.severity) ||
      ![
        'configuration',
        'compilation',
        'collection',
        'runtime',
        'cleanup',
        'reporter',
      ].includes(diagnostic.phase) ||
      (diagnostic.unhandled !== undefined &&
        (diagnostic.unhandled !== 'rejection' ||
          diagnostic.phase !== 'runtime' ||
          diagnostic.severity !== 'error'))
    )
      return false
    if (diagnostic.cause !== undefined) pending.push(diagnostic.cause)
    if (diagnostic.errors !== undefined) {
      if (!Array.isArray(diagnostic.errors)) return false
      pending.push(...diagnostic.errors)
    }
  }
  return true
}

/** Reports consume sealed execution evidence and never control a worker. */
/** Historical closed task data is never replayed into a new run's event stream. */
export interface ClosedMachineFileRecord {
  version: 1
  runId: string
  revision: string
  result: {
    entry: { entry: TestEntry; timestamp: number }
    file: FileResult
    cases: CaseResult[]
    suites: SuiteResult[]
  }
  diagnostics: Extract<ResultEvent, { type: 'diagnostic' }>[]
  caseCompletions: Extract<ResultEvent, { type: 'case-end' }>[]
}

/** Closed history retains actual suite payloads and their original diagnostic slots. */
function isRetainedSuiteError(
  event: Extract<ResultEvent, { type: 'diagnostic' }>,
  record: ClosedMachineFileRecord
): boolean {
  const owner = event.suiteError
  if (
    !owner ||
    !record.diagnostics.includes(event) ||
    event.runId !== record.runId ||
    event.revision !== record.revision ||
    event.entryId !== record.result.entry.entry.id ||
    !Number.isSafeInteger(owner.index) ||
    owner.index < 0
  )
    return false
  const suites = record.result.suites.filter(
    (suite) =>
      suite.entryId === event.entryId && suite.suiteId === owner.suiteId
  )
  return (
    suites.length === 1 &&
    suites[0].errors[owner.index] !== undefined &&
    isDeepStrictEqual(suites[0].errors[owner.index], event.diagnostic)
  )
}

export function createMachineReporter(options: {
  projectDir: string
  reporters: readonly ResultReporter[]
  outputFile?: string
  write?: (text: string) => void
  writeError?: (text: string) => void
  presentation?: Omit<TestReporterOptions, 'write' | 'projectDir' | 'style'>
  collect?: boolean
  /** JSON's empty-selection policy does not change the owned run outcome. */
  emptySelectionPassWithNoTests?: boolean
  replayTaskResults?: boolean
  recordedReporterErrors?: SerializedDiagnostic[]
  /** Borrowed from the enclosing watch lifetime; generation disposal leaves it open. */
  customReporterSession?: Awaited<ReturnType<typeof openCustomReporters>>
}) {
  const enabled = options.reporters.some((name) => name !== 'default')
  const collector =
    enabled || options.collect
      ? createTestReporter({ write: () => {}, projectDir: options.projectDir })
      : undefined
  const write = options.write ?? ((text: string) => process.stdout.write(text))
  const liveReporters = options.reporters
    .filter(
      (name): name is 'verbose' | 'dot' => name === 'verbose' || name === 'dot'
    )
    .map((style) =>
      createTestReporter({
        ...options.presentation,
        projectDir: options.projectDir,
        style,
        write,
        writeError: options.writeError,
      })
    )
  const customNames = options.reporters.filter(isCustomResultReporter)
  let custom = options.customReporterSession
  let initialized = custom !== undefined || customNames.length === 0
  let initialization: Promise<void> | undefined
  function initialize({ signal }: { signal?: AbortSignal } = {}) {
    if (initialized) return Promise.resolve()
    return (initialization ??= openCustomReporters({
      projectDir: options.projectDir,
      reporters: customNames,
      signal,
      write,
      writeError: options.writeError,
    }).then((session) => {
      custom = session
      initialized = true
    }))
  }
  let retainedFiles: ClosedMachineFileRecord[] = []
  let unexecutedEntries: TestEntry[] = []
  let retainedSpecificationOrder: readonly string[] | undefined
  function json(fileMessage: 'task' | 'formatted' = 'task') {
    let summary = collector!.getSummary()
    const currentEvents = collector!.getEvents()
    const current = collector!.getResults()
    const currentIds = new Set(current.entries.map(({ entry }) => entry.id))
    const retained = retainedFiles.filter(
      (record) => !currentIds.has(record.result.entry.entry.id)
    )
    const retainedIds = new Set(
      retained.map((record) => record.result.entry.entry.id)
    )
    const empty = unexecutedEntries.filter(
      (entry) => !currentIds.has(entry.id) && !retainedIds.has(entry.id)
    )
    const emptyIds = new Set(empty.map((entry) => entry.id))
    const initialTimestamp =
      currentEvents.find((event) => event.type === 'run-start')?.timestamp ?? 0
    const entries = [
      ...current.entries,
      ...retained.map((record) => record.result.entry),
      ...empty.map((entry) => ({ entry, timestamp: initialTimestamp })),
    ]
    const files = [
      ...current.files,
      ...retained.map((record) => record.result.file),
    ]
    const cases = [
      ...current.cases,
      ...retained.flatMap((record) => record.result.cases),
    ]
    const suiteResults = [
      ...current.suites,
      ...retained.flatMap((record) => record.result.suites),
    ]
    // These original diagnostic/case facts are render data, never onEvent calls.
    const events = [
      ...currentEvents,
      ...retained.flatMap((record) => [
        ...record.diagnostics,
        ...record.caseCompletions,
      ]),
    ]
    if (retainedFiles.length || unexecutedEntries.length) {
      const counts = () => ({ passed: 0, failed: 0, skipped: 0, cancelled: 0 })
      const caseCounts = counts(),
        fileCounts = counts()
      for (const test of cases) if (!test.bail) caseCounts[test.status]++
      for (const file of files) fileCounts[file.status]++
      fileCounts.passed += empty.length
      summary = {
        ...summary,
        status:
          summary.status === 'passed' &&
          (caseCounts.failed > 0 ||
            caseCounts.cancelled > 0 ||
            fileCounts.failed > 0 ||
            fileCounts.cancelled > 0)
            ? 'failed'
            : summary.status,
        cases: caseCounts,
        files: fileCounts,
      }
    }
    const specificationOrder = events.find(
      (event) => event.type === 'run-start'
    )?.specificationOrder
    const orderedEntries = orderTestSpecifications(
      entries,
      retainedSpecificationOrder ?? specificationOrder,
      (item) => item.entry.id
    )
    // The selected reference's SnapshotSummary accumulation contract.
    const snapshot = {
      added: 0,
      didUpdate: events.some(
        (event) =>
          event.type === 'run-start' && event.snapshotUpdateMode === 'all'
      ),
      failure: false,
      filesAdded: 0,
      filesRemoved: 0,
      filesRemovedList: [] as string[],
      filesUnmatched: 0,
      filesUpdated: 0,
      matched: 0,
      total: 0,
      unchecked: 0,
      uncheckedKeysByFile: [] as { filePath: string; keys: string[] }[],
      unmatched: 0,
      updated: 0,
    }
    for (const event of events) {
      if (event.type !== 'snapshot-summary') continue
      const result = event.snapshot
      if (result.added) snapshot.filesAdded++
      if (result.fileDeleted) snapshot.filesRemoved++
      if (result.unmatched) snapshot.filesUnmatched++
      if (result.updated) snapshot.filesUpdated++
      for (const field of [
        'added',
        'matched',
        'unchecked',
        'unmatched',
        'updated',
      ] as const)
        snapshot[field] += result[field]
      snapshot.total +=
        result.added + result.matched + result.unmatched + result.updated
      if (result.uncheckedKeys.length)
        snapshot.uncheckedKeysByFile.push({
          filePath: result.filepath,
          keys: [...result.uncheckedKeys],
        })
    }
    // The pinned JSON reporter describes task results. A process rejection
    // fails the command but does not rewrite a completed task into a failure.
    const unhandledOnlyFiles = new Set(
      files.flatMap((file) => {
        if (file.status !== 'failed') return []
        const diagnostics = events.filter(
          (event) =>
            event.type === 'diagnostic' &&
            event.entryId === file.entryId &&
            event.diagnostic.severity === 'error'
        )
        return diagnostics.length > 0 &&
          diagnostics.every(
            (event) =>
              event.type === 'diagnostic' &&
              event.diagnostic.unhandled === 'rejection'
          ) &&
          !cases.some(
            (test) =>
              test.entryId === file.entryId &&
              (test.status === 'failed' || test.status === 'cancelled')
          ) &&
          !suiteResults.some(
            (suite) =>
              suite.entryId === file.entryId &&
              (suite.status === 'failed' || suite.status === 'cancelled')
          )
          ? [file.entryId]
          : []
      })
    )
    const suites = new Map<string, 'passed' | 'failed' | 'pending'>()
    for (const { entry } of entries) {
      const completedSuites = suiteResults.filter(
        (suite) => suite.entryId === entry.id
      )
      if (completedSuites.length) {
        for (const suite of completedSuites) {
          suites.set(
            JSON.stringify([entry.id, suite.suiteId]),
            suite.status === 'failed' ||
              suite.status === 'cancelled' ||
              (suite.suiteId === entry.id &&
                !unhandledOnlyFiles.has(entry.id) &&
                files.find((file) => file.entryId === entry.id)?.status ===
                  'failed')
              ? 'failed'
              : suite.mode === 'todo'
                ? 'pending'
                : 'passed'
          )
        }
        continue
      }
      // Older emitted entries do not publish suite completion metadata.
      const selected = cases.filter((test) => test.entryId === entry.id)
      const suiteIds = new Set([
        entry.id,
        ...selected.flatMap(
          (test) => test.ancestors?.map((suite) => suite.id) ?? []
        ),
      ])
      for (const id of suiteIds) {
        const tests =
          id === entry.id
            ? selected
            : selected.filter((test) =>
                test.ancestors?.some((suite) => suite.id === id)
              )
        suites.set(
          JSON.stringify([entry.id, id]),
          tests.some(
            (test) => test.status === 'failed' || test.status === 'cancelled'
          ) ||
            (id === entry.id &&
              !unhandledOnlyFiles.has(entry.id) &&
              files.find((result) => result.entryId === entry.id)?.status ===
                'failed')
            ? 'failed'
            : 'passed'
        )
      }
    }
    return {
      numTotalTestSuites: suites.size,
      numPassedTestSuites: [...suites.values()].filter(
        (status) => status === 'passed'
      ).length,
      numFailedTestSuites: [...suites.values()].filter(
        (status) => status === 'failed'
      ).length,
      numPendingTestSuites: [...suites.values()].filter(
        (status) => status === 'pending'
      ).length,
      numTotalTests: cases.length,
      numPassedTests: summary.cases.passed,
      numFailedTests: summary.cases.failed + summary.cases.cancelled,
      numPendingTests: cases.filter(
        (test) => test.status === 'skipped' && test.mode !== 'todo'
      ).length,
      numTodoTests: cases.filter((test) => test.mode === 'todo').length,
      snapshot,
      startTime: events.find((event) => event.type === 'run-start')?.timestamp,
      success:
        (entries.length > 0 ||
          options.emptySelectionPassWithNoTests !== false) &&
        (summary.status === 'passed' ||
          (summary.status === 'failed' &&
            files.length === entries.length &&
            summary.files.cancelled === 0 &&
            summary.files.failed === unhandledOnlyFiles.size &&
            unhandledOnlyFiles.size > 0 &&
            events.every(
              (event) =>
                event.type !== 'diagnostic' ||
                event.diagnostic.severity !== 'error' ||
                (event.entryId !== undefined &&
                  unhandledOnlyFiles.has(event.entryId) &&
                  event.diagnostic.unhandled === 'rejection')
            ))),
      testResults: orderedEntries.map(({ entry, timestamp }) => {
        const file = files.find((result) => result.entryId === entry.id)
        const diagnostics = events.filter(
          (event) => event.type === 'diagnostic' && event.entryId === entry.id
        )
        const historical = retained.find(
          (record) => record.result.entry.entry.id === entry.id
        )
        const rootSuite = suiteResults.find(
          (suite) => suite.entryId === entry.id && suite.suiteId === entry.id
        )
        const fileErrors = [
          ...(rootSuite?.errors ?? []),
          ...diagnostics.flatMap((event) =>
            event.type === 'diagnostic' &&
            event.diagnostic.severity === 'error' &&
            event.diagnostic.unhandled === undefined &&
            !isReportedSuiteError(event, currentEvents) &&
            !(historical && isRetainedSuiteError(event, historical))
              ? [event.diagnostic]
              : []
          ),
        ].flatMap((error) =>
          error.name === 'AggregateError' && error.errors
            ? error.errors
            : [error]
        )
        return {
          assertionResults: orderTestDeclarations(
            entry.id,
            cases.filter((test) => test.entryId === entry.id),
            (test) => test.caseId
          ).map((test) => ({
            ancestorTitles: test.ancestors?.map((suite) => suite.name) ?? [],
            fullName: [
              ...(test.ancestors?.map((suite) => suite.name) ?? []),
              test.testName ?? test.name,
            ].join(' '),
            status:
              test.mode === 'todo'
                ? 'todo'
                : test.status === 'cancelled'
                  ? test.bail
                    ? 'pending'
                    : 'failed'
                  : test.status,
            title: test.testName ?? test.name,
            ...(test.bail
              ? {}
              : test.mode === 'skip' || test.mode === 'todo'
                ? test.pending
                  ? { duration: test.durationMs }
                  : {}
                : { duration: test.durationMs }),
            failureMessages: events.flatMap((event) =>
              !test.pending &&
              event.type === 'case-end' &&
              event.entryId === test.entryId &&
              event.caseId === test.caseId
                ? event.errors.flatMap((error) => {
                    // Vitest flattens one AggregateError level in task errors.
                    // The full tree remains in next.events for diagnostics.
                    const errors =
                      error.name === 'AggregateError' && error.errors
                        ? error.errors
                        : [error]
                    return errors.map((childError) => {
                      // The target uses the bare message when no stack exists.
                      if (!childError.stack) return childError.message
                      // Helper trimming belongs to human presentation. Vitest's
                      // JSON reporter retains the complete saved helper stack.
                      if (childError.stack.includes('__VITEST_HELPER__'))
                        return childError.stack
                      const message = formatDiagnostic(
                        childError,
                        options.projectDir
                      )
                      // The reference JSON reporter uses the saved stack;
                      // async assertions can retain its original Error heading.
                      const heading = childError.stack.split('\n', 1)[0]
                      return heading
                        ? message.replace(/^[^\n]*/, () => heading)
                        : message
                    })
                  })
                : []
            ),
            location: test.location
              ? { line: test.location.line, column: test.location.column }
              : undefined,
            meta:
              [...events]
                .reverse()
                .find(
                  (
                    event
                  ): event is Extract<ResultEvent, { type: 'case-end' }> =>
                    event.type === 'case-end' &&
                    event.entryId === test.entryId &&
                    event.caseId === test.caseId
                )?.meta ??
              test.meta ??
              {},
            tags: test.tags ?? [],
            benchmarks: [],
          })),
          startTime: timestamp,
          endTime: timestamp + (file?.durationMs ?? 0),
          status:
            emptyIds.has(entry.id) ||
            file?.status === 'passed' ||
            file?.status === 'skipped' ||
            unhandledOnlyFiles.has(entry.id)
              ? 'passed'
              : 'failed',
          message:
            fileMessage === 'task'
              ? (fileErrors[0]?.message ?? '')
              : diagnostics
                  .filter(
                    (event) =>
                      event.type !== 'diagnostic' ||
                      event.diagnostic.unhandled === undefined
                  )
                  .map((event) =>
                    event.type === 'diagnostic'
                      ? formatDiagnostic(event.diagnostic, options.projectDir)
                      : ''
                  )
                  .join('\n'),
          name: entry.file,
        }
      }),
      // Keep retries, snapshots, attachments, console attribution and errors
      // that have no test identity. Never discard evidence to fit a parser.
      next: { version: 1, summary, events: currentEvents },
    }
  }
  function junit() {
    const report = json('formatted')
    const events = collector!.getEvents()
    const suites = report.testResults.map((file) => {
      const entry = collector!
        .getResults()
        .entries.find((item) => item.entry.file === file.name)!
      const output = (stream: 'stdout' | 'stderr') =>
        events
          .filter(
            (event) =>
              event.type === 'output' &&
              event.entryId === entry.entry.id &&
              event.stream === stream
          )
          .map((event) => (event.type === 'output' ? event.text : ''))
          .join('')
      const tests = file.assertionResults.map((test) => {
        const failure =
          test.status === 'failed' && test.failureMessages.length
            ? `<failure message="${xml(test.failureMessages[0])}">${xml(test.failureMessages.join('\n'))}</failure>`
            : test.status === 'failed'
              ? '<failure message="Test cancelled or incomplete"/>'
              : ''
        const skipped =
          test.status === 'skipped' || test.status === 'todo'
            ? '<skipped/>'
            : ''
        const classname = relative(options.projectDir, file.name)
          .split(sep)
          .join('/')
        const name = [...test.ancestorTitles, test.title].join(' > ')
        return `<testcase classname="${xml(classname)}" name="${xml(name)}" time="${(test.duration ?? 0) / 1000}">${failure}${skipped}</testcase>`
      })
      if (
        file.message ||
        (file.status === 'failed' &&
          !file.assertionResults.some((test) => test.status === 'failed'))
      ) {
        tests.push(
          `<testcase name="[file error]"><error message="${xml(file.message || 'File execution failed')}">${xml(file.message)}</error></testcase>`
        )
      }
      return `<testsuite name="${xml(file.name)}" tests="${tests.length}" failures="${file.assertionResults.filter((test) => test.status === 'failed').length}" errors="${tests.length - file.assertionResults.length}" skipped="${file.assertionResults.filter((test) => test.status === 'skipped' || test.status === 'todo').length}" time="${(file.endTime - file.startTime) / 1000}">${tests.join('')}<system-out>${xml(output('stdout'))}</system-out><system-err>${xml(output('stderr'))}</system-err></testsuite>`
    })
    // Configuration/run errors can precede file-start. CI still needs an error.
    const unscoped = events.filter(
      (event) =>
        event.type === 'diagnostic' &&
        !event.entryId &&
        event.diagnostic.severity === 'error'
    )
    if (unscoped.length)
      suites.push(
        `<testsuite name="[run errors]" tests="1" errors="1"><testcase name="[run error]"><error>${xml(unscoped.map((event) => (event.type === 'diagnostic' ? formatDiagnostic(event.diagnostic) : '')).join('\n'))}</error></testcase></testsuite>`
      )
    return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>${suites.join('')}</testsuites>\n`
  }
  async function publishContent(content: string, signal?: AbortSignal) {
    if (!options.outputFile) {
      write(content)
      return
    }
    const target = resolve(options.projectDir, options.outputFile)
    const temporary = `${target}.${randomUUID()}.tmp`
    await mkdir(dirname(target), { recursive: true })
    try {
      await writeFile(temporary, content, { flag: 'wx', signal })
      signal?.throwIfAborted()
      await rename(temporary, target)
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
    }
  }
  return {
    initialize,
    get captureTaskResults() {
      return (
        custom?.captureTaskResults === true ||
        options.reporters.includes('blob')
      )
    },
    get needsTaskReplay() {
      return custom?.captureTaskResults === true
    },
    onEvent(event: ResultEvent) {
      if (!initialized)
        throw new Error(
          'Custom reporters must initialize before execution events.'
        )
      collector?.onEvent(event)
      if (
        !options.replayTaskResults ||
        !custom?.captureTaskResults ||
        event.type === 'output'
      )
        custom?.onEvent(
          event,
          event.type === 'file-end' || event.type === 'module-complete'
            ? {
                ...collector!.getResults(),
                ...(event.type === 'module-complete'
                  ? {
                      files: [
                        ...collector!.getResults().files,
                        {
                          entryId: event.entryId,
                          status: event.status,
                          durationMs: event.durationMs,
                        },
                      ],
                    }
                  : {}),
                events: collector!.getEvents(),
                status:
                  event.status === 'cancelled'
                    ? 'cancelled'
                    : event.status === 'failed'
                      ? 'failed'
                      : 'passed',
              }
            : undefined
        )
      for (const reporter of liveReporters) reporter.onEvent(event)
    },
    async replayFile(taskTree: ReporterTaskSnapshot) {
      if (!custom?.captureTaskResults) return
      const completion: CustomReporterCompletion = {
        ...collector!.getResults(),
        events: collector!.getEvents(),
        status: 'passed',
      }
      await custom.replayFile(taskTree, completion)
    },
    snapshotClosedFiles(
      entryIds: ReadonlySet<string>
    ): ClosedMachineFileRecord[] {
      if (!collector) return []
      const results = collector.getResults()
      const events = collector.getEvents()
      const records: ClosedMachineFileRecord[] = []
      for (const entry of results.entries) {
        if (!entryIds.has(entry.entry.id)) continue
        const file = results.files.find(
          (item) => item.entryId === entry.entry.id
        )
        const start = events.find(
          (event) =>
            event.type === 'file-start' && event.entry.id === entry.entry.id
        )
        if (
          !file ||
          !start ||
          start.type !== 'file-start' ||
          typeof start.revision !== 'string' ||
          !events.some(
            (event) =>
              event.type === 'file-end' && event.entryId === entry.entry.id
          )
        )
          continue
        records.push({
          version: 1,
          runId: start.runId,
          revision: start.revision,
          result: {
            entry: { entry: entry.entry, timestamp: entry.timestamp },
            file,
            cases: results.cases.filter(
              (item) => item.entryId === entry.entry.id
            ),
            suites: results.suites.filter(
              (item) => item.entryId === entry.entry.id
            ),
          },
          diagnostics: events.filter(
            (event): event is Extract<ResultEvent, { type: 'diagnostic' }> =>
              event.type === 'diagnostic' && event.entryId === entry.entry.id
          ),
          caseCompletions: events.filter(
            (event): event is Extract<ResultEvent, { type: 'case-end' }> =>
              event.type === 'case-end' && event.entryId === entry.entry.id
          ),
        })
      }
      return structuredClone(records)
    },
    retainUnexecutedFiles(
      entries: readonly TestEntry[],
      previous: readonly ClosedMachineFileRecord[],
      specificationOrder: readonly string[]
    ) {
      const identities = new Map(entries.map((entry) => [entry.id, entry]))
      if (
        identities.size !== entries.length ||
        new Set(specificationOrder).size !== specificationOrder.length
      )
        throw new Error('Invalid retained watch file selection.')
      const seen = new Set<string>()
      for (const record of previous) {
        const entry = record.result.entry.entry
        const current = identities.get(entry.id)
        if (
          record.version !== 1 ||
          !record.runId ||
          !record.revision ||
          !current ||
          current.file !== entry.file ||
          current.profile.id !== entry.profile.id ||
          seen.has(entry.id) ||
          record.result.file.entryId !== entry.id ||
          record.result.cases.some((item) => item.entryId !== entry.id) ||
          record.result.suites.some((item) => item.entryId !== entry.id) ||
          [...record.diagnostics, ...record.caseCompletions].some(
            (event) =>
              event.runId !== record.runId || event.entryId !== entry.id
          )
        )
          throw new Error('Invalid closed watch file record.')
        seen.add(entry.id)
      }
      retainedFiles = structuredClone([...previous])
      unexecutedEntries = structuredClone([...entries])
      retainedSpecificationOrder = [...specificationOrder]
    },
    getJson: () => json(),
    getJUnit: junit,
    async finish({
      signal,
      preparedCoverageMap,
    }: {
      signal?: AbortSignal
      preparedCoverageMap?: PreparedCoverageMap
    } = {}) {
      signal?.throwIfAborted()
      if (!enabled) return
      const events = collector!.getEvents()
      if (!events.some((event) => event.type === 'run-end'))
        throw new Error(
          'Cannot publish a completed report before authoritative run cleanup.'
        )
      const pendingBlobs: ((
        errors: SerializedDiagnostic[]
      ) => Promise<void>)[] = []
      let recordedReporterErrors: SerializedDiagnostic[] =
        options.recordedReporterErrors ?? []
      for (const reporter of options.reporters) {
        signal?.throwIfAborted()
        if (reporter === 'default' || isCustomResultReporter(reporter)) continue
        if (reporter === 'verbose' || reporter === 'dot') continue
        if (reporter === 'tap' || reporter === 'tap-flat') {
          write(
            renderTapReport(collector!.getResults(), collector!.getEvents(), {
              projectDir: options.projectDir,
              flat: reporter === 'tap-flat',
            })
          )
          continue
        }
        if (reporter === 'github-actions') {
          await writeGithubActionsReport(
            collector!.getResults(),
            collector!.getEvents(),
            { write, signal }
          )
          continue
        }
        const publish = async (errorsForBlob: SerializedDiagnostic[]) => {
          const content =
            reporter === 'junit'
              ? junit()
              : `${JSON.stringify(
                  reporter === 'blob'
                    ? {
                        version: 1,
                        kind: 'next-test-results',
                        projectDir: options.projectDir,
                        referenceVersion: '5.0.4',
                        events,
                        ...(errorsForBlob.length
                          ? { reporterErrors: errorsForBlob }
                          : {}),
                      }
                    : {
                        ...json(),
                        ...(preparedCoverageMap === undefined
                          ? {}
                          : { coverageMap: preparedCoverageMap }),
                      },
                  null,
                  2
                )}\n`
          await publishContent(content, signal)
        }
        if (reporter === 'blob' && custom?.captureTaskResults)
          pendingBlobs.push(publish)
        else await publish(recordedReporterErrors)
      }
      let customError: unknown
      if (custom) {
        const status = collector!.getSummary().status
        if (status === 'running')
          throw new Error(
            'Custom reporters require an authoritative terminal result.'
          )
        try {
          await custom.finish({
            ...collector!.getResults(),
            events,
            status,
            recordedReporterErrors: options.recordedReporterErrors,
          })
        } catch (error) {
          customError = error
        }
      }
      if (pendingBlobs.length) {
        recordedReporterErrors = [
          ...recordedReporterErrors,
          ...(await custom!.collectErrors()),
        ]
        for (const publish of pendingBlobs)
          await publish(recordedReporterErrors)
      }
      if (customError) throw customError
    },
    async dispose({
      deferCustom,
      handledCustomFailure,
    }: { deferCustom?: true; handledCustomFailure?: unknown } = {}) {
      const errors: unknown[] = []
      for (const reporter of [collector, ...liveReporters]) {
        try {
          reporter?.dispose()
        } catch (error) {
          errors.push(error)
        }
      }
      try {
        if (!options.customReporterSession && !deferCustom) {
          if (handledCustomFailure === undefined) await custom?.dispose()
          else await custom?.dispose({ handledFailure: handledCustomFailure })
        }
      } catch (error) {
        errors.push(error)
      }
      if (errors.length === 1) throw errors[0]
      if (errors.length)
        throw new AggregateError(errors, 'Result reporter disposal failed.')
    },
  }
}

/** Merge validated Next events or pinned foreign final tasks without a compiler. */
export async function mergeResultReports(
  directory: string,
  options: {
    projectDir: string
    reporters: readonly ResultReporter[]
    outputFile?: string
  }
) {
  const input = resolve(options.projectDir, directory)
  const names = await readdir(input)
  const imported = await tryMergeVitestBlobReports(input, names, options)
  if (imported !== undefined) return imported
  const paths = names.filter((file) => file.endsWith('.json')).sort()
  if (!paths.length) throw new Error('No Next test result blobs found.')
  const blobs: {
    projectDir: string
    events: ResultEvent[]
    reporterErrors?: SerializedDiagnostic[]
  }[] = []
  const runIds = new Set<string>()
  const entries = new Set<string>()
  const eventTypes = new Set([
    'run-start',
    'run-end',
    'file-start',
    'file-end',
    'case-start',
    'case-end',
    'file-collected',
    'task-update',
    'module-complete',
    'suite-end',
    'diagnostic',
    'output',
    'attachment',
    'test-annotation',
    'test-artifact',
    'snapshot-summary',
  ])
  for (const name of paths) {
    const path = resolve(input, name)
    if ((await stat(path)).size > 16 * 1024 * 1024)
      throw new Error(`Result blob is too large: ${name}`)
    let blob
    try {
      blob = JSON.parse(await readFile(path, 'utf8'))
    } catch {
      throw new Error(`Invalid JSON in Next test result blob: ${name}`)
    }
    if (
      blob?.version !== 1 ||
      blob.kind !== 'next-test-results' ||
      blob.referenceVersion !== '5.0.4' ||
      typeof blob.projectDir !== 'string' ||
      !isAbsolute(blob.projectDir) ||
      !Array.isArray(blob.events) ||
      (blob.reporterErrors !== undefined &&
        (!Array.isArray(blob.reporterErrors) ||
          !blob.reporterErrors.every(validDiagnostic))) ||
      blob.events[0]?.type !== 'run-start' ||
      blob.events.at(-1)?.type !== 'run-end'
    ) {
      throw new Error(
        `Unsupported or incomplete Next test result blob: ${name}. Published Vitest blobs use a separate final-task adapter; unknown blobs are never executed.`
      )
    }
    const originalRunId = blob.events[0].runId
    if (typeof originalRunId !== 'string' || runIds.has(originalRunId))
      throw new Error(`Duplicate or invalid blob run identity: ${name}`)
    runIds.add(originalRunId)
    const localEntries = new Set<string>()
    const endedEntries = new Set<string>()
    const startedAttempts = new Set<string>()
    const endedAttempts = new Set<string>()
    const logicalCases = new Set<string>()
    const collectedFiles = new Set<string>()
    const endedCases = new Set<string>()
    const endedSuites = new Set<string>()
    for (const [index, event] of blob.events.entries()) {
      if (
        event?.version !== 1 ||
        event.runId !== originalRunId ||
        !Number.isFinite(event.timestamp) ||
        !eventTypes.has(event.type)
      ) {
        throw new Error(`Invalid result event in blob: ${name}`)
      }
      if (
        (event.type === 'test-annotation' &&
          !validAnnotation(event.annotation)) ||
        (event.type === 'test-artifact' && !validArtifact(event.artifact)) ||
        (event.type === 'diagnostic' && !validDiagnostic(event.diagnostic)) ||
        (event.type === 'output' &&
          (typeof event.text !== 'string' ||
            !['stdout', 'stderr'].includes(event.stream))) ||
        (event.type === 'attachment' &&
          (!event.attachment ||
            typeof event.attachment.name !== 'string' ||
            typeof event.attachment.path !== 'string' ||
            !isAbsolute(event.attachment.path) ||
            typeof event.attachment.contentType !== 'string' ||
            !['trace', 'screenshot', 'video', 'file'].includes(
              event.attachment.kind
            )))
      ) {
        throw new Error(`Invalid result payload in blob: ${name}`)
      }
      if (event.type === 'snapshot-summary') {
        const snapshot = event.snapshot
        if (
          !snapshot ||
          typeof snapshot.filepath !== 'string' ||
          typeof snapshot.fileDeleted !== 'boolean' ||
          !Array.isArray(snapshot.uncheckedKeys) ||
          snapshot.uncheckedKeys.some(
            (key: unknown) => typeof key !== 'string'
          ) ||
          ['added', 'matched', 'unchecked', 'unmatched', 'updated'].some(
            (field) =>
              !Number.isSafeInteger(snapshot[field]) || snapshot[field] < 0
          )
        ) {
          throw new Error(`Invalid snapshot summary in blob: ${name}`)
        }
      }
      if (
        (event.type === 'run-start' && index !== 0) ||
        (event.type === 'run-end' && index !== blob.events.length - 1)
      )
        throw new Error(`Duplicate run boundary in blob: ${name}`)
      if (
        event.type === 'run-start' &&
        event.snapshotUpdateMode !== undefined &&
        !['none', 'new', 'all'].includes(event.snapshotUpdateMode)
      )
        throw new Error(`Invalid snapshot mode in blob: ${name}`)
      if (
        [
          'case-start',
          'case-end',
          'file-collected',
          'task-update',
          'module-complete',
          'test-annotation',
          'test-artifact',
          'suite-end',
          'file-end',
          'snapshot-summary',
        ].includes(event.type) &&
        (typeof event.entryId !== 'string' || !localEntries.has(event.entryId))
      ) {
        throw new Error(`Result references an uncollected file: ${name}`)
      }
      if (
        [
          'case-start',
          'case-end',
          'file-collected',
          'task-update',
          'module-complete',
          'test-annotation',
          'test-artifact',
          'suite-end',
          'file-end',
          'snapshot-summary',
        ].includes(event.type) &&
        endedEntries.has(event.entryId)
      )
        throw new Error(`Result follows file completion in blob: ${name}`)
      if (
        event.type === 'case-end' ||
        event.type === 'suite-end' ||
        event.type === 'file-end' ||
        event.type === 'module-complete' ||
        event.type === 'run-end'
      ) {
        if (
          !['passed', 'failed', 'skipped', 'cancelled'].includes(
            event.status
          ) ||
          !Number.isFinite(event.durationMs) ||
          event.durationMs < 0
        ) {
          throw new Error(`Invalid result status or duration in blob: ${name}`)
        }
        if (event.type === 'run-end' && event.status === 'skipped')
          throw new Error(`Invalid blob completion status: ${name}`)
      }
      if (event.type === 'file-collected' || event.type === 'task-update') {
        assertReporterTaskTree(event.taskTree, event.entryId)
        if (event.type === 'file-collected') {
          if (collectedFiles.has(event.entryId))
            throw new Error(`Duplicate collected task file in blob: ${name}`)
          collectedFiles.add(event.entryId)
        } else {
          const ids = new Set<string>()
          const visit = (task: import('./live-tasks').ReporterTaskSnapshot) => {
            ids.add(task.id)
            task.tasks?.forEach(visit)
          }
          visit(event.taskTree)
          if (
            !collectedFiles.has(event.entryId) ||
            !Array.isArray(event.taskUpdateIds) ||
            !event.taskUpdateIds.length ||
            new Set(event.taskUpdateIds).size !== event.taskUpdateIds.length ||
            event.taskUpdateIds.some(
              (id: unknown) => typeof id !== 'string' || !ids.has(id)
            ) ||
            !Array.isArray(event.caseResults)
          )
            throw new Error(`Invalid live task update in blob: ${name}`)
          for (const result of event.caseResults) {
            assertReporterTaskTree(event.taskTree, event.entryId, result.caseId)
            const logical = JSON.stringify([event.entryId, result.caseId])
            const scope = JSON.stringify([
              event.entryId,
              result.caseId,
              result.attempt?.id,
            ])
            if (
              result.entryId !== event.entryId ||
              typeof result.caseId !== 'string' ||
              typeof result.name !== 'string' ||
              typeof result.attempt?.id !== 'string' ||
              !Number.isSafeInteger(result.attempt.retry) ||
              result.attempt.retry < 0 ||
              !Number.isSafeInteger(result.attempt.repeat) ||
              result.attempt.repeat < 0 ||
              !['passed', 'failed', 'skipped', 'cancelled'].includes(
                result.status
              ) ||
              !Number.isFinite(result.durationMs) ||
              result.durationMs < 0 ||
              !Array.isArray(result.errors) ||
              !result.errors.every(validDiagnostic) ||
              !endedAttempts.has(scope) ||
              logicalCases.has(logical) ||
              !event.taskUpdateIds.includes(result.caseId)
            )
              throw new Error(
                `Logical result lacks one actual completed case in blob: ${name}`
              )
            logicalCases.add(logical)
          }
        }
      }
      if (event.type === 'suite-end') {
        if (
          typeof event.suiteId !== 'string' ||
          typeof event.name !== 'string' ||
          !['run', 'skip', 'todo'].includes(event.mode) ||
          !Array.isArray(event.ancestors) ||
          event.ancestors.some(
            (ancestor: any) =>
              !ancestor ||
              typeof ancestor.id !== 'string' ||
              typeof ancestor.name !== 'string'
          ) ||
          !Array.isArray(event.errors) ||
          !event.errors.every(validDiagnostic)
        )
          throw new Error(`Invalid suite result in blob: ${name}`)
        const identity = JSON.stringify([event.entryId, event.suiteId])
        if (endedSuites.has(identity))
          throw new Error(`Duplicate completed suite in blob: ${name}`)
        endedSuites.add(identity)
      }
      if (
        event.type === 'case-start' ||
        event.type === 'case-end' ||
        event.type === 'test-annotation' ||
        event.type === 'test-artifact'
      ) {
        if (
          typeof event.caseId !== 'string' ||
          (event.type !== 'test-annotation' &&
            event.type !== 'test-artifact' &&
            typeof event.name !== 'string') ||
          typeof event.attempt?.id !== 'string' ||
          !Number.isSafeInteger(event.attempt.retry) ||
          event.attempt.retry < 0 ||
          !Number.isSafeInteger(event.attempt.repeat) ||
          event.attempt.repeat < 0 ||
          (event.type === 'case-end' &&
            (!Array.isArray(event.errors) ||
              !event.errors.every(validDiagnostic)))
        )
          throw new Error(`Invalid case result in blob: ${name}`)
        const scope = JSON.stringify([
          event.entryId,
          event.caseId,
          event.attempt.id,
        ])
        if (event.type === 'case-start') startedAttempts.add(scope)
        if (
          event.type === 'test-annotation' &&
          (!startedAttempts.has(scope) || endedAttempts.has(scope))
        )
          throw new Error(
            `Annotation references an inactive attempt in blob: ${name}`
          )
        if (event.type === 'test-artifact' && !startedAttempts.has(scope))
          throw new Error(
            `Artifact references an unknown attempt in blob: ${name}`
          )
        if (event.type === 'case-end') {
          if (
            (event.meta !== undefined &&
              (!event.meta ||
                typeof event.meta !== 'object' ||
                Array.isArray(event.meta))) ||
            (event.tags !== undefined &&
              (!Array.isArray(event.tags) ||
                event.tags.some((tag: unknown) => typeof tag !== 'string'))) ||
            (event.annotations !== undefined &&
              (!Array.isArray(event.annotations) ||
                !event.annotations.every(validAnnotation)))
          )
            throw new Error(`Invalid case metadata in blob: ${name}`)
          if (
            (event.pending !== undefined &&
              typeof event.pending !== 'boolean') ||
            (event.pending &&
              (event.status !== 'skipped' || event.mode !== 'skip')) ||
            (event.note !== undefined && typeof event.note !== 'string')
          )
            throw new Error(`Invalid runtime skip result in blob: ${name}`)
          if (
            (event.bail !== undefined && typeof event.bail !== 'boolean') ||
            (event.bail &&
              (event.status !== 'cancelled' ||
                event.mode !== 'run' ||
                event.pending ||
                event.errors.length !== 0 ||
                event.durationMs !== 0 ||
                event.attempt.retry !== 0 ||
                event.attempt.repeat !== 0 ||
                startedAttempts.has(scope) ||
                endedCases.has(JSON.stringify([event.entryId, event.caseId]))))
          )
            throw new Error(`Invalid bail result in blob: ${name}`)
          const identity = JSON.stringify([
            event.entryId,
            event.caseId,
            event.attempt.id,
          ])
          if (endedAttempts.has(identity))
            throw new Error(`Duplicate completed attempt in blob: ${name}`)
          endedAttempts.add(identity)
          endedCases.add(JSON.stringify([event.entryId, event.caseId]))
        }
      }
      if (event.type === 'file-start') {
        if (
          typeof event.entry?.id !== 'string' ||
          typeof event.entry.file !== 'string' ||
          !isAbsolute(event.entry.file)
        ) {
          throw new Error(`Invalid file identity in blob: ${name}`)
        }
        if (entries.has(event.entry.id))
          throw new Error(
            `Overlapping shards or duplicate test file: ${event.entry.id}`
          )
        entries.add(event.entry.id)
        localEntries.add(event.entry.id)
        const local = relative(blob.projectDir, event.entry.file)
        if (isAbsolute(local) || local === '..' || local.startsWith(`..${sep}`))
          throw new Error(`Test file escapes the blob project: ${name}`)
        // Shards may come from different checkout directories. Editor paths
        // resolve in this checkout while entry/case/attempt IDs remain intact.
        event.entry.file = resolve(options.projectDir, local)
      }
      if (event.type === 'file-end') {
        const results = blob.events.filter(
          (candidate: any) =>
            candidate.type === 'suite-end' &&
            candidate.entryId === event.entryId
        )
        if (
          results.length &&
          !endedSuites.has(JSON.stringify([event.entryId, event.entryId]))
        )
          throw new Error(`Incomplete suite results in blob: ${name}`)
        for (const suite of results) {
          if (
            suite.ancestors.some(
              (ancestor: any) =>
                !endedSuites.has(JSON.stringify([event.entryId, ancestor.id]))
            )
          )
            throw new Error(`Uncollected suite ancestor in blob: ${name}`)
        }
        endedEntries.add(event.entryId)
      }
    }
    const specificationOrder = blob.events[0].specificationOrder
    if (
      specificationOrder !== undefined &&
      (!Array.isArray(specificationOrder) ||
        specificationOrder.some((id: unknown) => typeof id !== 'string') ||
        new Set(specificationOrder).size !== specificationOrder.length ||
        [...localEntries].some((id) => !specificationOrder.includes(id)))
    )
      throw new Error(`Invalid specification order in blob: ${name}`)
    if (localEntries.size !== endedEntries.size)
      throw new Error(`Incomplete file results in blob: ${name}`)
    blobs.push(blob)
  }
  const machine = createMachineReporter({
    ...options,
    collect: true,
    replayTaskResults: true,
    recordedReporterErrors: blobs.flatMap((blob) => blob.reporterErrors ?? []),
  })
  const human = options.reporters.includes('default')
    ? createTestReporter({
        projectDir: options.projectDir,
        write: (text) => {
          process.stdout.write(text)
        },
        writeError: (text) => {
          process.stderr.write(text)
        },
      })
    : undefined
  const runId = randomUUID()
  const emit = (event: ResultEvent) => {
    machine.onEvent(event)
    human?.onEvent(event)
  }
  try {
    await machine.initialize()
    const started = Math.min(...blobs.map((blob) => blob.events[0].timestamp))
    const ended = Math.max(
      ...blobs.map((blob) => blob.events.at(-1)!.timestamp)
    )
    emit({
      version: 1,
      runId,
      timestamp: started,
      type: 'run-start',
      specificationOrder: [
        ...new Set(
          blobs.flatMap((blob) =>
            blob.events[0].type === 'run-start' &&
            blob.events[0].specificationOrder !== undefined
              ? blob.events[0].specificationOrder
              : blob.events.flatMap((event) =>
                  event.type === 'file-start' ? [event.entry.id] : []
                )
          )
        ),
      ],
      snapshotUpdateMode: blobs.some(
        (blob) =>
          blob.events[0].type === 'run-start' &&
          blob.events[0].snapshotUpdateMode === 'all'
      )
        ? 'all'
        : 'none',
    })
    let status: 'passed' | 'failed' | 'cancelled' = 'passed'
    for (const blob of blobs) {
      const end = blob.events.at(-1)! as Extract<
        ResultEvent,
        { type: 'run-end' }
      >
      if (!['passed', 'failed', 'cancelled'].includes(end.status))
        throw new Error('Invalid blob completion status.')
      if (end.status === 'failed') status = 'failed'
      else if (end.status === 'cancelled' && status !== 'failed')
        status = 'cancelled'
      const terminalTrees = new Map<string, ReporterTaskSnapshot>()
      for (const event of blob.events) {
        if (event.type === 'file-collected' || event.type === 'task-update')
          terminalTrees.set(event.entryId, event.taskTree)
      }
      for (const event of blob.events.slice(1, -1)) {
        emit({ ...event, runId })
        if (event.type === 'file-end' && machine.needsTaskReplay) {
          const tree = terminalTrees.get(event.entryId)
          const entry = blob.events.find(
            (candidate) =>
              candidate.type === 'file-start' &&
              candidate.entry.id === event.entryId
          )
          if (!tree || entry?.type !== 'file-start')
            throw new Error(
              'Logical-case reporter replay requires an actual recorded task graph.'
            )
          await machine.replayFile({ ...tree, filepath: entry.entry.file })
        }
      }
    }
    emit({
      version: 1,
      runId,
      timestamp: ended,
      type: 'run-end',
      status,
      durationMs: Math.max(0, ended - started),
    })
    const report = machine.getJson()
    await machine.finish()
    return blobs.some((blob) => blob.reporterErrors?.length)
      ? 'failed'
      : report.next.summary.status
  } finally {
    try {
      await machine.dispose()
    } finally {
      human?.dispose()
    }
  }
}
