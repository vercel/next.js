import {
  assertReporterTaskParents,
  type ReporterTaskSnapshot,
} from '../reporting/live-tasks'
import { basename, dirname, join } from 'node:path'
import assert from 'node:assert'
import type {
  ExecuteTestOptions,
  CompiledBrowserClientTestArtifact,
} from '../contracts'
import type { ResultEvent, SerializedDiagnostic } from '../reporting/events'
import { serializeDiagnostic } from '../reporting/diagnostics'
import type { RunnerCaseResult, RunnerFailure } from '../runner/lifecycle'
import { getFinalCaseResults } from '../reporting/final-cases'
import type { ClientMessage } from './protocol'
import type { SnapshotUpdate } from '../assertions/snapshots'
import { resolveClientDeclarations } from './collection'

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
  type CaseState = {
    started: boolean
    ended: boolean
    status?: 'passed' | 'failed' | 'skipped' | 'cancelled'
    mode?: 'run' | 'skip' | 'todo'
    lastResult?: RunnerCaseResult
    attempt?: RunnerCaseResult['attempt']
  }
  let declarations: ReturnType<typeof resolveClientDeclarations> | undefined
  const cases = new Map<string, CaseState>()
  const attemptResults: RunnerCaseResult[] = []
  const startedAttempts = new Set<string>()
  const completedCases = new Set<string>()
  const logicalResults = new Set<string>()
  let latestCase: string | undefined
  const enterCase = (id: string) => {
    if (latestCase !== undefined && latestCase !== id)
      completedCases.add(latestCase)
    latestCase = id
  }
  const suites = new Map<
    string,
    { status: string; blockedDescendants: boolean; errors: RunnerFailure[] }
  >()
  const blockedCases = new Set<string>()
  const blockedSuites = new Set<string>()
  let active: string | undefined,
    complete = false,
    fileFailed = false,
    requiresInterruption = false
  let updates: SnapshotUpdate[] = []
  let status: 'passed' | 'failed' = 'failed'
  const hasFailedOutcomes = () =>
    fileFailed ||
    [...getFinalCaseResults(attemptResults).values()].some(
      (result) =>
        result.status === 'failed' ||
        result.status === 'cancelled' ||
        result.errors.length > 0
    ) ||
    [...suites.values()].some(
      (suite) => suite.status === 'failed' || suite.status === 'cancelled'
    )
  const same = (left: unknown, right: unknown) =>
    JSON.stringify(left) === JSON.stringify(right)
  const caseAncestors = (id: string) => {
    const ids: string[] = []
    for (let parent = declarations!.cases.get(id)!.suiteId; parent; ) {
      ids.push(parent)
      parent = declarations!.suites.get(parent)!.parentId ?? ''
    }
    return ids
  }
  const suiteAncestors = (id: string) => {
    const ids: string[] = []
    for (let parent = declarations!.suites.get(id)!.parentId; parent; ) {
      ids.push(parent)
      parent = declarations!.suites.get(parent)!.parentId
    }
    return ids
  }
  const blocked = (ancestors: string[]) =>
    ancestors.some((id) => {
      const suite = suites.get(id)
      return (
        suite?.status === 'failed' &&
        suite.blockedDescendants &&
        suite.errors.some((failure) =>
          ['beforeAll', 'aroundAll'].includes(failure.phase)
        )
      )
    })
  function reporterTaskTree(rootSnapshot: unknown): ReporterTaskSnapshot {
    const invalid = () => new Error('Invalid Browser Mode reporter task tree.')
    if (!declarations || !record(rootSnapshot)) throw invalid()
    const visited = new Set<string>()
    const filename = basename(artifact.client.sourceFile)
    function visit(value: unknown, parentId: string | null, index = 0) {
      if (!record(value) || typeof value.id !== 'string') throw invalid()
      const suite = declarations!.suites.get(value.id)
      const test = declarations!.cases.get(value.id)
      const root = value.id === artifact.entryId
      const declaredParent = suite?.parentId ?? test?.suiteId ?? null
      const name = root ? filename : (suite?.name ?? test?.testName)
      const fullTestName = root
        ? undefined
        : suite
          ? [...suite.ancestors.map((parent) => parent.name), suite.name]
              .filter(Boolean)
              .join(' > ')
          : test?.name
      if (
        (!suite && !test) ||
        visited.has(value.id) ||
        declaredParent !== parentId ||
        (value.parentSuiteId !== undefined &&
          value.parentSuiteId !==
            (declaredParent === artifact.entryId ? null : declaredParent)) ||
        (!root && value.id !== `${parentId}/${index}`) ||
        value.type !== (suite ? 'suite' : 'test') ||
        value.name !== name ||
        value.fullTestName !== fullTestName ||
        value.fullName !==
          [filename, fullTestName].filter(Boolean).join(' > ') ||
        !['run', 'skip', 'todo', 'only', 'queued'].includes(
          String(value.mode)
        ) ||
        !record(value.meta) ||
        !Array.isArray(value.tags) ||
        !value.tags.every((tag) => typeof tag === 'string') ||
        ['each', 'concurrent', 'shuffle', 'fails'].some(
          (key) => value[key] !== undefined && typeof value[key] !== 'boolean'
        ) ||
        ['repeats', 'timeout'].some(
          (key) => value[key] !== undefined && !duration(value[key])
        ) ||
        (value.retry !== undefined &&
          !duration(value.retry) &&
          !record(value.retry)) ||
        (root
          ? value.filepath !== artifact.client.sourceFile ||
            typeof value.projectName !== 'string'
          : value.filepath !== undefined || value.projectName !== undefined) ||
        Object.keys(value).some(
          (key) =>
            ![
              'id',
              'type',
              'name',
              'fullName',
              'fullTestName',
              'parentSuiteId',
              'mode',
              'meta',
              'tags',
              'each',
              'concurrent',
              'shuffle',
              'retry',
              'repeats',
              'fails',
              'timeout',
              'result',
              'tasks',
              'annotations',
              'artifacts',
              'filepath',
              'projectName',
            ].includes(key)
        )
      )
        throw invalid()
      visited.add(value.id)
      if (value.result !== undefined) {
        const result = value.result
        if (
          !record(result) ||
          !['run', 'pass', 'fail', 'skip', 'only', 'todo', 'queued'].includes(
            String(result.state)
          ) ||
          (result.duration !== undefined && !duration(result.duration)) ||
          (result.errors !== undefined && !Array.isArray(result.errors))
        )
          throw invalid()
      }
      if (suite) {
        if (
          !Array.isArray(value.tasks) ||
          value.annotations !== undefined ||
          value.artifacts !== undefined
        )
          throw invalid()
        value.tasks.forEach((task, childIndex) =>
          visit(task, value.id as string, childIndex)
        )
      } else if (
        value.tasks !== undefined ||
        (value.annotations !== undefined &&
          !Array.isArray(value.annotations)) ||
        (value.artifacts !== undefined && !Array.isArray(value.artifacts))
      )
        throw invalid()
    }
    visit(rootSnapshot, null)
    if (visited.size !== declarations.cases.size + declarations.suites.size)
      throw invalid()
    try {
      assertReporterTaskParents(rootSnapshot as unknown as ReporterTaskSnapshot)
    } catch {
      throw invalid()
    }
    return rootSnapshot as unknown as ReporterTaskSnapshot
  }
  // Unstarted mode changes remain quarantined until the failed ancestor suite
  // that authorized them arrives. They can never become invented start events.
  const visibleEvents = () =>
    events.filter((value) => {
      if (value.type === 'case-end' && blockedCases.has(value.caseId))
        return blocked(caseAncestors(value.caseId))
      if (value.type === 'task-update')
        return value.taskUpdateIds.every((id) =>
          blockedCases.has(id)
            ? blocked(caseAncestors(id))
            : blockedSuites.has(id)
              ? blocked(suiteAncestors(id))
              : true
        )
      if (value.type === 'suite-end' && blockedSuites.has(value.suiteId))
        return blocked(suiteAncestors(value.suiteId))
      return true
    })
  function accept(
    message: Exclude<
      ClientMessage,
      { type: 'snapshot' | 'browser-command' | 'output' }
    >
  ) {
    if (complete)
      throw new Error('Browser Mode facts arrived after terminal completion.')
    if (message.type === 'collected') {
      if (declarations || cases.size || suites.size)
        throw new Error('Duplicate Browser Mode collected declarations.')
      declarations = resolveClientDeclarations(
        message.declarations,
        artifact.entryId,
        options
      )
      if (message.taskTree !== undefined && !options.captureTaskResults)
        throw new Error('Unsolicited Browser Mode collected task tree.')
      if (options.captureTaskResults) {
        const taskTree = reporterTaskTree(message.taskTree)
        event({
          type: 'file-collected',
          entryId: artifact.entryId,
          revision: artifact.revision,
          taskTree,
        })
      }
    } else if (message.type === 'case-start') {
      const context = message.context
      const declared =
        record(context) && declarations?.cases.get(context.testId as string)
      const state = declared ? cases.get(declared.id) : undefined
      const previous = state?.lastResult
      const ordinal =
        record(context) &&
        integer(context.retry) &&
        integer(context.repeat) &&
        (previous
          ? !previous.pending &&
            previous.status !== 'skipped' &&
            previous.status !== 'cancelled' &&
            ((context.repeat === previous.attempt.repeat &&
              context.retry === previous.attempt.retry + 1 &&
              previous.status === 'failed') ||
              (context.repeat === previous.attempt.repeat + 1 &&
                context.retry === 0))
          : context.retry === 0 && context.repeat === 0)
      if (
        !declared ||
        declared.mode !== 'run' ||
        active ||
        completedCases.has(declared.id) ||
        (state && (!state.started || !state.ended)) ||
        startedAttempts.has(context.id) ||
        !ordinal ||
        caseAncestors(declared.id).some((id) => suites.has(id)) ||
        context.fileId !== artifact.entryId ||
        context.id !==
          `${options.runId}/${declared.id}/${context.retry}/${context.repeat}` ||
        context.name !== declared.name
      )
        throw new Error('Invalid or duplicate Browser Mode attempt owner.')
      enterCase(declared.id)
      active = declared.id
      startedAttempts.add(context.id)
      cases.set(declared.id, {
        ...state,
        started: true,
        ended: false,
        attempt: {
          id: context.id,
          retry: context.retry,
          repeat: context.repeat,
        },
      })
      event({
        type: 'case-start',
        entryId: artifact.entryId,
        revision: artifact.revision,
        caseId: declared.id,
        attempt: {
          id: context.id,
          retry: context.retry,
          repeat: context.repeat,
        },
        name: declared.name,
        testName: declared.testName,
        ancestors: declared.ancestors,
        mode: declared.mode,
      })
    } else if (message.type === 'artifact') {
      const declared = declarations?.cases.get(message.taskId)
      const suite = declarations?.suites.get(message.taskId)
      assert(declared || suite, `Artifact target not found: ${message.taskId}`)
      assert(
        declared !== undefined,
        `Artifact can only be recorded on a test, instead got ${message.taskId === artifact.entryId ? 'module' : 'suite'}`
      )
      const attempt = message.attempt
      if (
        !record(attempt) ||
        !integer(attempt.retry) ||
        !integer(attempt.repeat) ||
        attempt.id !==
          `${options.runId}/${declared.id}/${attempt.retry}/${attempt.repeat}` ||
        !startedAttempts.has(attempt.id) ||
        !record(message.artifact) ||
        typeof message.artifact.type !== 'string' ||
        message.artifact.attachments?.length
      )
        throw new Error('Invalid Browser Mode artifact facts.')
      event({
        type: 'test-artifact',
        entryId: artifact.entryId,
        revision: artifact.revision,
        caseId: declared.id,
        attempt: {
          id: attempt.id,
          retry: attempt.retry,
          repeat: attempt.repeat,
        },
        artifact: message.artifact,
      })
      return message.artifact
    } else if (message.type === 'case-end') {
      const result = message.result
      const declared = record(result)
        ? declarations?.cases.get(result.caseId as string)
        : undefined
      const state = declared ? cases.get(declared.id) : undefined
      const mode = result?.mode ?? declared?.mode
      if (
        !declared ||
        state?.ended ||
        completedCases.has(declared.id) ||
        (active !== undefined && (!state?.started || active !== declared.id)) ||
        caseAncestors(declared.id).some((id) => suites.has(id)) ||
        result.entryId !== artifact.entryId ||
        !record(result.attempt) ||
        !integer(result.attempt.retry) ||
        !integer(result.attempt.repeat) ||
        result.attempt.id !==
          `${options.runId}/${declared.id}/${result.attempt.retry}/${result.attempt.repeat}` ||
        (state?.started
          ? !same(result.attempt, state.attempt)
          : result.attempt.retry !== 0 || result.attempt.repeat !== 0) ||
        result.name !== declared.name ||
        (result.testName !== undefined &&
          result.testName !== declared.testName) ||
        (result.ancestors !== undefined &&
          !same(result.ancestors, declared.ancestors)) ||
        !['passed', 'failed', 'skipped', 'cancelled'].includes(
          String(result.status)
        ) ||
        !['run', 'skip', 'todo'].includes(String(mode)) ||
        !duration(result.durationMs) ||
        (result.pending !== undefined && typeof result.pending !== 'boolean') ||
        (result.note !== undefined && typeof result.note !== 'string') ||
        result.bail
      )
        throw new Error(
          'Browser Mode case result does not match its immutable attempt.'
        )
      failures(result.errors)
      if (state?.started) {
        if (
          result.status === 'cancelled' ||
          (mode !== declared.mode &&
            !(
              mode === 'skip' &&
              result.pending === true &&
              result.status === 'skipped'
            )) ||
          (result.status === 'skipped' &&
            !(mode === 'skip' && result.pending === true)) ||
          (result.status === 'passed' && result.errors.length)
        )
          throw new Error(
            'Browser Mode case result does not match its immutable attempt.'
          )
      } else {
        const inactive =
          declared.mode !== 'run' &&
          mode === declared.mode &&
          result.status === 'skipped' &&
          !result.errors.length &&
          !result.pending
        const suiteSkipped =
          mode === 'skip' &&
          result.status === 'skipped' &&
          !result.errors.length &&
          !result.pending
        const cancelled =
          declared.mode === 'run' &&
          mode === 'run' &&
          result.status === 'cancelled' &&
          !result.errors.length &&
          !result.pending
        if (!inactive && !suiteSkipped && !cancelled)
          throw new Error(
            'Browser Mode case result does not match its immutable attempt.'
          )
        if (!inactive && suiteSkipped) blockedCases.add(declared.id)
        requiresInterruption ||= cancelled
      }
      if (state?.started) active = undefined
      enterCase(declared.id)
      const completed = { ...result, mode }
      attemptResults.push(completed)
      const final = getFinalCaseResults(
        attemptResults.filter((attempt) => attempt.caseId === declared.id)
      ).get(declared.id)!
      cases.set(declared.id, {
        started: !!state?.started,
        ended: true,
        status: final.status,
        mode: final.mode,
        attempt: result.attempt,
        lastResult: completed,
      })
      event({
        ...result,
        type: 'case-end',
        entryId: artifact.entryId,
        revision: artifact.revision,
        caseId: declared.id,
        attempt: {
          id: result.attempt.id,
          retry: result.attempt.retry,
          repeat: result.attempt.repeat,
        },
        name: declared.name,
        testName: declared.testName,
        ancestors: declared.ancestors,
        mode,
        errors: result.errors.map((failure) =>
          diagnostic(
            failure.error,
            failure.phase === 'cleanup' ? 'cleanup' : 'runtime'
          )
        ),
      })
    } else if (message.type === 'task-update') {
      if (
        !options.captureTaskResults ||
        !Array.isArray(message.taskUpdateIds) ||
        !message.taskUpdateIds.length ||
        new Set(message.taskUpdateIds).size !== message.taskUpdateIds.length ||
        !message.taskUpdateIds.every(
          (id) => declarations?.cases.has(id) || declarations?.suites.has(id)
        ) ||
        !Array.isArray(message.caseResults)
      )
        throw new Error('Invalid or unsolicited Browser Mode task update.')
      const taskTree = reporterTaskTree(message.taskTree)
      const batchIds = new Set<string>()
      const caseResults = message.caseResults.map((result) => {
        const declared = record(result)
          ? declarations?.cases.get(result.caseId as string)
          : undefined
        const state = declared ? cases.get(declared.id) : undefined
        const final = declared
          ? getFinalCaseResults(
              attemptResults.filter((attempt) => attempt.caseId === declared.id)
            ).get(declared.id)
          : undefined
        if (
          !declared ||
          !state?.ended ||
          logicalResults.has(declared.id) ||
          batchIds.has(declared.id) ||
          !message.taskUpdateIds.includes(declared.id) ||
          !same(result, final)
        )
          throw new Error('Invalid Browser Mode logical case result.')
        batchIds.add(declared.id)
        return {
          ...result,
          entryId: artifact.entryId,
          revision: artifact.revision,
          caseId: declared.id,
          name: declared.name,
          testName: declared.testName,
          ancestors: declared.ancestors,
          errors: result.errors.map((failure) =>
            diagnostic(
              failure.error,
              failure.phase === 'cleanup' ? 'cleanup' : 'runtime'
            )
          ),
        }
      })
      for (const id of batchIds) logicalResults.add(id)
      event({
        type: 'task-update',
        entryId: artifact.entryId,
        revision: artifact.revision,
        taskTree,
        taskUpdateIds: message.taskUpdateIds,
        caseResults,
      })
    } else if (message.type === 'suite-end') {
      const result = message.result
      const declared =
        record(result) && declarations?.suites.get(result.suiteId as string)
      if (
        !declared ||
        active ||
        suites.has(declared.id) ||
        suiteAncestors(declared.id).some((id) => suites.has(id)) ||
        result.entryId !== artifact.entryId ||
        result.name !== declared.name ||
        !same(result.ancestors, declared.ancestors) ||
        !['run', 'skip', 'todo'].includes(String(result.mode)) ||
        (result.mode !== declared.mode && result.mode !== 'skip') ||
        !['passed', 'failed', 'skipped', 'cancelled'].includes(
          String(result.status)
        ) ||
        !duration(result.durationMs)
      )
        throw new Error('Invalid Browser Mode suite facts.')
      failures(result.errors)
      if (
        (result.blockedDescendants !== undefined &&
          typeof result.blockedDescendants !== 'boolean') ||
        (result.blockedDescendants &&
          (result.status !== 'failed' ||
            !result.errors.some((failure) =>
              ['beforeAll', 'aroundAll'].includes(failure.phase)
            )))
      )
        throw new Error('Invalid Browser Mode blocked suite facts.')
      const descendants = [...declarations!.cases.keys()].filter((id) =>
        caseAncestors(id).includes(declared.id)
      )
      const children = [...declarations!.suites.values()].filter(
        (suite) => suite.parentId === declared.id
      )
      if (
        descendants.some((id) => !cases.get(id)?.ended) ||
        children.some((suite) => !suites.has(suite.id))
      )
        throw new Error('Browser Mode suite omitted declared descendants.')
      if (
        result.blockedDescendants &&
        (!descendants.some(
          (id) => declarations!.cases.get(id)!.mode === 'run'
        ) ||
          descendants.some((id) => {
            const state = cases.get(id)!
            return (
              state.started ||
              state.status !== 'skipped' ||
              state.mode !== 'skip'
            )
          }))
      )
        throw new Error(
          'Browser Mode blocked suite contradicts its descendant attempts.'
        )
      const childFailed =
        descendants.some((id) => cases.get(id)!.status === 'failed') ||
        children.some((suite) => suites.get(suite.id)!.status === 'failed') ||
        result.errors.length > 0
      const childCancelled =
        descendants.some((id) => cases.get(id)!.status === 'cancelled') ||
        children.some((suite) => suites.get(suite.id)!.status === 'cancelled')
      const runnable = descendants.some((id) => cases.get(id)!.mode === 'run')
      if (
        (childFailed && result.status !== 'failed') ||
        (!childFailed && result.status === 'failed') ||
        (!childFailed && childCancelled && result.status !== 'cancelled') ||
        (result.status === 'passed' && (result.mode !== 'run' || !runnable)) ||
        (result.status === 'skipped' && runnable)
      )
        throw new Error(
          'Browser Mode suite result contradicts its declared descendants.'
        )
      if (result.mode !== declared.mode) blockedSuites.add(declared.id)
      requiresInterruption ||= result.status === 'cancelled'
      suites.set(declared.id, {
        status: result.status,
        blockedDescendants: result.blockedDescendants === true,
        errors: result.errors,
      })
      event({
        ...result,
        type: 'suite-end',
        entryId: artifact.entryId,
        revision: artifact.revision,
        suiteId: declared.id,
        name: declared.name,
        ancestors: declared.ancestors,
        errors: result.errors.map((failure) => diagnostic(failure.error)),
      })
    } else if (message.type === 'failure') {
      fileFailed = true
      fileFailure(message.error)
    } else if (message.type === 'complete') {
      const failed = hasFailedOutcomes()
      if (
        !['passed', 'failed'].includes(message.status) ||
        typeof message.interrupted !== 'boolean' ||
        !integer(message.caseCount) ||
        message.caseCount !==
          [...cases.values()].filter((state) => state.ended).length ||
        active ||
        !Array.isArray(message.updates)
      )
        throw new Error('Invalid Browser Mode completion facts.')
      if (declarations) {
        if (
          cases.size !== declarations.cases.size ||
          suites.size !== declarations.suites.size ||
          (options.captureTaskResults &&
            logicalResults.size !== declarations.cases.size) ||
          [...blockedCases].some((id) => !blocked(caseAncestors(id))) ||
          [...blockedSuites].some((id) => !blocked(suiteAncestors(id))) ||
          (requiresInterruption && !message.interrupted)
        )
          throw new Error(
            'Browser Mode completion omitted declared tasks or their suite failure.'
          )
      } else if (
        message.status !== 'failed' ||
        !failed ||
        cases.size ||
        suites.size
      )
        throw new Error(
          'Browser Mode completion omitted collected declarations.'
        )
      if (
        (message.status === 'passed' &&
          (failed || message.interrupted || !declarations?.cases.size)) ||
        (message.status === 'failed' && !failed && !message.interrupted)
      )
        throw new Error(
          'Browser Mode completion omitted a failure or selected case.'
        )
      if (
        (message.status !== 'passed' || failed || message.interrupted) &&
        message.updates.length
      )
        throw new Error('Failed Browser Mode owner returned snapshot updates.')
      if (
        message.updates.length &&
        ![...cases.values()].some((state) => state.started)
      )
        throw new Error(
          'Browser Mode snapshot updates require an executed case.'
        )
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
      return hasFailedOutcomes()
    },
    fail(error: unknown) {
      fileFailed = true
      status = 'failed'
      updates = []
      fileFailure(error)
    },
    result() {
      if (!complete)
        throw new Error('Browser Mode completed without terminal facts.')
      return {
        status: hasFailedOutcomes() ? ('failed' as const) : status,
        updates: hasFailedOutcomes() ? [] : updates,
        events: visibleEvents(),
      }
    },
    get events() {
      return visibleEvents()
    },
  }
}
