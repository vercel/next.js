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
import { stripVTControlCharacters } from 'node:util'
import type { ResultEvent } from './events'
import { createTestReporter, formatDiagnostic } from './reporter'

export type ResultReporter = 'default' | 'json' | 'junit' | 'blob'

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
    if (!['default', 'json', 'junit', 'blob'].includes(name)) {
      throw new Error(
        `Unsupported result reporter "${name}". Available: default, json, junit, blob. Custom reporter adapters remain unimplemented.`
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
      ].includes(diagnostic.phase)
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
export function createMachineReporter(options: {
  projectDir: string
  reporters: readonly ResultReporter[]
  outputFile?: string
  write?: (text: string) => void
  collect?: boolean
}) {
  const enabled = options.reporters.some((name) => name !== 'default')
  const collector =
    enabled || options.collect
      ? createTestReporter({ write: () => {}, projectDir: options.projectDir })
      : undefined
  function json() {
    const summary = collector!.getSummary()
    const events = collector!.getEvents()
    const { entries, files, cases } = collector!.getResults()
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
    const suites = new Map<string, 'passed' | 'failed' | 'pending'>()
    for (const { entry } of entries) {
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
      success: summary.status === 'passed',
      testResults: entries.map(({ entry, timestamp }) => {
        const file = files.find((result) => result.entryId === entry.id)
        const diagnostics = events.filter(
          (event) => event.type === 'diagnostic' && event.entryId === entry.id
        )
        return {
          assertionResults: cases
            .filter((test) => test.entryId === entry.id)
            .map((test) => ({
              ancestorTitles: test.ancestors?.map((suite) => suite.name) ?? [],
              fullName: [
                ...(test.ancestors?.map((suite) => suite.name) ?? []),
                test.testName ?? test.name,
              ].join(' '),
              status:
                test.mode === 'todo'
                  ? 'todo'
                  : test.status === 'cancelled'
                    ? 'failed'
                    : test.status,
              title: test.testName ?? test.name,
              duration: test.durationMs,
              failureMessages: events.flatMap((event) =>
                event.type === 'case-end' &&
                event.entryId === test.entryId &&
                event.caseId === test.caseId
                  ? event.errors.map((error) =>
                      formatDiagnostic(error, options.projectDir)
                    )
                  : []
              ),
              location: test.location,
              meta: {},
              tags: [],
            })),
          startTime: timestamp,
          endTime: timestamp + (file?.durationMs ?? 0),
          status:
            file?.status === 'passed' || file?.status === 'skipped'
              ? 'passed'
              : 'failed',
          message: diagnostics
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
      next: { version: 1, summary, events },
    }
  }
  function junit() {
    const report = json()
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
        return `<testcase classname="${xml(test.ancestorTitles.join(' > ') || entry.entry.profile.id)}" name="${xml(test.title)}" time="${test.duration / 1000}">${failure}${skipped}</testcase>`
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
  return {
    onEvent(event: ResultEvent) {
      collector?.onEvent(event)
    },
    getJson: json,
    getJUnit: junit,
    async finish() {
      if (!enabled) return
      const events = collector!.getEvents()
      if (!events.some((event) => event.type === 'run-end'))
        throw new Error(
          'Cannot publish a completed report before authoritative run cleanup.'
        )
      for (const reporter of options.reporters) {
        if (reporter === 'default') continue
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
                    }
                  : json(),
                null,
                2
              )}\n`
        if (!options.outputFile) {
          ;(options.write ?? ((text) => process.stdout.write(text)))(content)
          continue
        }
        const target = resolve(options.projectDir, options.outputFile)
        const temporary = `${target}.${randomUUID()}.tmp`
        await mkdir(dirname(target), { recursive: true })
        try {
          await writeFile(temporary, content, { flag: 'wx' })
          await rename(temporary, target)
        } finally {
          await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error
          })
        }
      }
    },
    dispose() {
      collector?.dispose()
    },
  }
}

/** Merge only Next-owned, versioned blobs; this never starts a compiler. */
export async function mergeResultReports(
  directory: string,
  options: {
    projectDir: string
    reporters: readonly ResultReporter[]
    outputFile?: string
  }
) {
  const input = resolve(options.projectDir, directory)
  const paths = (await readdir(input))
    .filter((file) => file.endsWith('.json'))
    .sort()
  if (!paths.length) throw new Error('No Next test result blobs found.')
  const blobs: { projectDir: string; events: ResultEvent[] }[] = []
  const runIds = new Set<string>()
  const entries = new Set<string>()
  const eventTypes = new Set([
    'run-start',
    'run-end',
    'file-start',
    'file-end',
    'case-start',
    'case-end',
    'diagnostic',
    'output',
    'attachment',
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
      blob.events[0]?.type !== 'run-start' ||
      blob.events.at(-1)?.type !== 'run-end'
    ) {
      throw new Error(
        `Unsupported or incomplete Next test result blob: ${name}. Vitest blobs require an adapter; they are not executed as a fallback.`
      )
    }
    const originalRunId = blob.events[0].runId
    if (typeof originalRunId !== 'string' || runIds.has(originalRunId))
      throw new Error(`Duplicate or invalid blob run identity: ${name}`)
    runIds.add(originalRunId)
    const localEntries = new Set<string>()
    const endedEntries = new Set<string>()
    const endedAttempts = new Set<string>()
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
        ['case-start', 'case-end', 'file-end', 'snapshot-summary'].includes(
          event.type
        ) &&
        (typeof event.entryId !== 'string' || !localEntries.has(event.entryId))
      ) {
        throw new Error(`Result references an uncollected file: ${name}`)
      }
      if (
        ['case-start', 'case-end', 'file-end', 'snapshot-summary'].includes(
          event.type
        ) &&
        endedEntries.has(event.entryId)
      )
        throw new Error(`Result follows file completion in blob: ${name}`)
      if (
        event.type === 'case-end' ||
        event.type === 'file-end' ||
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
      if (event.type === 'case-start' || event.type === 'case-end') {
        if (
          typeof event.caseId !== 'string' ||
          typeof event.name !== 'string' ||
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
        if (event.type === 'case-end') {
          const identity = JSON.stringify([
            event.entryId,
            event.caseId,
            event.attempt.id,
          ])
          if (endedAttempts.has(identity))
            throw new Error(`Duplicate completed attempt in blob: ${name}`)
          endedAttempts.add(identity)
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
      if (event.type === 'file-end') endedEntries.add(event.entryId)
    }
    if (localEntries.size !== endedEntries.size)
      throw new Error(`Incomplete file results in blob: ${name}`)
    blobs.push(blob)
  }
  const machine = createMachineReporter({ ...options, collect: true })
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
    const started = Math.min(...blobs.map((blob) => blob.events[0].timestamp))
    const ended = Math.max(
      ...blobs.map((blob) => blob.events.at(-1)!.timestamp)
    )
    emit({
      version: 1,
      runId,
      timestamp: started,
      type: 'run-start',
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
      for (const event of blob.events.slice(1, -1)) emit({ ...event, runId })
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
    return report.next.summary.status
  } finally {
    machine.dispose()
    human?.dispose()
  }
}
