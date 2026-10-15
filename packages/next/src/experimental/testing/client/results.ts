import { basename, dirname, join } from 'node:path'
import type {
  ExecuteTestOptions,
  CompiledBrowserClientTestArtifact,
} from '../contracts'
import type { ResultEvent, SerializedDiagnostic } from '../reporting/events'
import { serializeDiagnostic } from '../reporting/diagnostics'
import type { RunnerFailure } from '../runner/lifecycle'
import type { ClientMessage } from './protocol'
import type { SnapshotUpdate } from '../assertions/snapshots'

type EventPayload<T> = T extends unknown
  ? Omit<T, 'version' | 'runId' | 'timestamp'>
  : never
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function integer(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) >= 0
}
function string(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
function duration(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
function ancestors(value: unknown) {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (item) =>
          record(item) && string(item.id) && typeof item.name === 'string'
      ))
  )
}
function failures(value: unknown): asserts value is RunnerFailure[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (item) =>
        record(item) &&
        [
          'beforeAll',
          'afterAll',
          'beforeEach',
          'afterEach',
          'aroundEach',
          'aroundAll',
          'test',
          'cleanup',
          'assertion',
          'runtime',
        ].includes(String(item.phase)) &&
        'error' in item
    )
  )
    throw new Error('Invalid Browser Mode failure facts.')
}
/** Facts are retained until the page, connection, browser process and HTTP owner close. */
export function createClientResultCollector(
  artifact: CompiledBrowserClientTestArtifact,
  options: ExecuteTestOptions,
  mapStack?: (stack: string) => NonNullable<SerializedDiagnostic['frames']>
) {
  const events: ResultEvent[] = []
  const snapshotPaths = new Set([
    artifact.client.sourceFile,
    join(
      dirname(artifact.client.sourceFile),
      '__snapshots__',
      `${basename(artifact.client.sourceFile)}.snap`
    ),
  ])
  const diagnostic = (
    error: unknown,
    phase: SerializedDiagnostic['phase'] = 'runtime'
  ) => serializeDiagnostic(error, { phase, mapStack })
  const event = (value: EventPayload<ResultEvent>) =>
    events.push({
      ...value,
      version: 1,
      runId: options.runId,
      timestamp: Date.now(),
    } as ResultEvent)
  const fileFailure = (error: unknown) =>
    event({
      type: 'diagnostic',
      entryId: artifact.entryId,
      revision: artifact.revision,
      diagnostic: diagnostic(error),
    })
  let started: { id: string; caseId: string; name: string } | undefined,
    ended = false,
    complete = false,
    failed = false
  const suiteIds = new Set<string>()
  let updates: SnapshotUpdate[] = []
  let status: 'passed' | 'failed' = 'failed'
  function accept(message: Exclude<ClientMessage, { type: 'snapshot' }>) {
    if (complete)
      throw new Error('Browser Mode facts arrived after terminal completion.')
    if (message.type === 'case-start') {
      const context = message.context
      if (
        started ||
        !record(context) ||
        context.fileId !== artifact.entryId ||
        !string(context.id) ||
        !string(context.testId) ||
        !context.testId.startsWith(`${artifact.entryId}/`) ||
        context.id !== `${options.runId}/${context.testId}/0/0` ||
        typeof context.name !== 'string' ||
        context.retry !== 0 ||
        context.repeat !== 0
      )
        throw new Error('Invalid or duplicate Browser Mode attempt owner.')
      started = { id: context.id, caseId: context.testId, name: context.name }
      event({
        type: 'case-start',
        entryId: artifact.entryId,
        revision: artifact.revision,
        caseId: context.testId,
        attempt: { id: context.id, retry: 0, repeat: 0 },
        name: context.name,
      })
    } else if (message.type === 'case-end') {
      const result = message.result
      if (
        !started ||
        ended ||
        !record(result) ||
        result.entryId !== artifact.entryId ||
        result.caseId !== started.caseId ||
        !record(result.attempt) ||
        result.attempt.id !== started.id ||
        result.attempt.retry !== 0 ||
        result.attempt.repeat !== 0 ||
        result.name !== started.name ||
        !['passed', 'failed', 'skipped', 'cancelled'].includes(
          String(result.status)
        ) ||
        !duration(result.durationMs) ||
        !ancestors(result.ancestors) ||
        (result.mode !== undefined &&
          !['run', 'skip', 'todo'].includes(String(result.mode)))
      )
        throw new Error(
          'Browser Mode case result does not match its immutable attempt.'
        )
      failures(result.errors)
      if (result.status === 'passed' && result.errors.length)
        throw new Error('Passing Browser Mode case returned errors.')
      ended = true
      failed ||=
        result.status === 'failed' ||
        result.status === 'cancelled' ||
        result.errors.length > 0
      event({
        ...result,
        type: 'case-end',
        revision: artifact.revision,
        errors: result.errors.map((failure) =>
          diagnostic(
            failure.error,
            failure.phase === 'cleanup' ? 'cleanup' : 'runtime'
          )
        ),
      })
    } else if (message.type === 'suite-end') {
      const result = message.result
      if (
        !record(result) ||
        result.entryId !== artifact.entryId ||
        !string(result.suiteId) ||
        (result.suiteId !== artifact.entryId &&
          !result.suiteId.startsWith(`${artifact.entryId}/`)) ||
        suiteIds.has(result.suiteId) ||
        typeof result.name !== 'string' ||
        !ancestors(result.ancestors) ||
        !Array.isArray(result.ancestors) ||
        !['run', 'skip', 'todo'].includes(String(result.mode)) ||
        !['passed', 'failed', 'skipped', 'cancelled'].includes(
          String(result.status)
        ) ||
        !duration(result.durationMs)
      )
        throw new Error('Invalid Browser Mode suite facts.')
      failures(result.errors)
      suiteIds.add(result.suiteId)
      failed ||=
        result.status === 'failed' ||
        result.status === 'cancelled' ||
        result.errors.length > 0
      event({
        ...result,
        type: 'suite-end',
        revision: artifact.revision,
        errors: result.errors.map((failure) => diagnostic(failure.error)),
      })
    } else if (message.type === 'failure') {
      failed = true
      fileFailure(message.error)
    } else if (message.type === 'complete') {
      if (
        !['passed', 'failed'].includes(message.status) ||
        typeof message.interrupted !== 'boolean' ||
        !integer(message.caseCount) ||
        message.caseCount !== (ended ? 1 : 0) ||
        (started && !ended) ||
        !Array.isArray(message.updates)
      )
        throw new Error('Invalid Browser Mode completion facts.')
      if (
        message.status === 'passed' &&
        (failed || message.interrupted || !ended)
      )
        throw new Error(
          'Browser Mode completion omitted a failure or selected case.'
        )
      if (
        (message.status !== 'passed' || failed || message.interrupted) &&
        message.updates.length
      )
        throw new Error('Failed Browser Mode owner returned snapshot updates.')
      if (message.updates.length && !options.updateSnapshots)
        throw new Error('Unsolicited Browser Mode snapshot updates.')
      const paths = new Set<string>()
      for (const update of message.updates) {
        if (
          !record(update) ||
          !string(update.path) ||
          !snapshotPaths.has(update.path) ||
          paths.has(update.path) ||
          (update.content !== null && typeof update.content !== 'string') ||
          (update.previousContent !== null &&
            typeof update.previousContent !== 'string')
        )
          throw new Error('Invalid Browser Mode snapshot update facts.')
        paths.add(update.path)
      }
      if (message.snapshotSummary !== undefined) {
        const summary = message.snapshotSummary
        if (
          !record(summary) ||
          summary.filepath !== artifact.client.sourceFile ||
          !['added', 'matched', 'unchecked', 'unmatched', 'updated'].every(
            (key) => integer(summary[key])
          ) ||
          typeof summary.fileDeleted !== 'boolean' ||
          !Array.isArray(summary.uncheckedKeys) ||
          !summary.uncheckedKeys.every((key) => typeof key === 'string')
        )
          throw new Error('Invalid Browser Mode snapshot summary.')
        event({
          type: 'snapshot-summary',
          entryId: artifact.entryId,
          revision: artifact.revision,
          snapshot: summary as unknown as Extract<
            ResultEvent,
            { type: 'snapshot-summary' }
          >['snapshot'],
        })
      }
      complete = true
      status = message.status
      updates = message.updates
    } else throw new Error('Unknown Browser Mode result message.')
  }
  return {
    accept,
    hasFailure() {
      return failed
    },
    fail(error: unknown) {
      failed = true
      status = 'failed'
      updates = []
      fileFailure(error)
    },
    result() {
      if (!complete)
        throw new Error('Browser Mode completed without terminal facts.')
      return {
        status: failed ? ('failed' as const) : status,
        updates: failed ? [] : updates,
        events,
      }
    },
    events,
  }
}
