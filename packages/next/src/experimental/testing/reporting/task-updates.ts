import type { RunnerCaseResult } from '../runner/lifecycle'
import type { File, Task, TaskLocation, Test, Suite } from '../runner/tasks'
import {
  captureReporterTaskTree,
  projectionCapturesOriginalResult,
  type ReporterTaskSnapshot,
  type ReporterTaskResultProjection,
} from './live-tasks'

// Capture before authored fake clocks can replace the execution realm's globals.
const realDateNow = Date.now.bind(Date)
const realSetTimeout = globalThis.setTimeout.bind(globalThis)
const realClearTimeout = globalThis.clearTimeout.bind(globalThis)

export type ReporterTaskPack = [string, Pick<Task, 'result' | 'meta'>]

export type { ReporterTaskResultProjection } from './live-tasks'

export interface ReporterCaseEvent {
  event: 'ready' | 'result'
  caseId: string
}

/** Occurrences stay ordered even when several transitions share one task pack. */
export function assertReporterCaseEvents(
  value: unknown,
  options: {
    caseIds: ReadonlySet<string>
    taskUpdateIds: readonly string[]
    resultIds: readonly string[]
    readyCases: Set<string>
    completed(caseId: string): boolean
  }
): asserts value is ReporterCaseEvent[] | undefined {
  if (value === undefined) return
  if (!Array.isArray(value))
    throw new Error('Invalid live reporter case occurrences.')
  const ready = new Set<string>()
  const completed = new Set<string>()
  const results: string[] = []
  for (const occurrence of value) {
    if (
      !occurrence ||
      typeof occurrence !== 'object' ||
      Object.keys(occurrence).length !== 2 ||
      !['ready', 'result'].includes(occurrence.event) ||
      typeof occurrence.caseId !== 'string' ||
      !options.caseIds.has(occurrence.caseId) ||
      !options.taskUpdateIds.includes(occurrence.caseId)
    )
      throw new Error('Invalid live reporter case occurrence owner.')
    if (occurrence.event === 'ready') {
      if (
        ready.has(occurrence.caseId) ||
        options.readyCases.has(occurrence.caseId) ||
        completed.has(occurrence.caseId) ||
        options.completed(occurrence.caseId)
      )
        throw new Error('Duplicate or completed live reporter case readiness.')
      ready.add(occurrence.caseId)
    } else {
      if (completed.has(occurrence.caseId))
        throw new Error('Duplicate live reporter case result occurrence.')
      completed.add(occurrence.caseId)
      results.push(occurrence.caseId)
    }
  }
  if (
    results.length !== options.resultIds.length ||
    results.some((id, index) => id !== options.resultIds[index])
  )
    throw new Error(
      'Live reporter occurrences differ from actual case results.'
    )
  for (const id of ready) options.readyCases.add(id)
}

export type ReporterTaskUpdate<Result = RunnerCaseResult> = {
  taskUpdateIds: string[]
  caseResults: Result[]
  /** Absent for legacy/default producers without actual readiness capture. */
  caseEvents?: ReporterCaseEvent[]
} & (
  | {
      kind?: undefined
      taskTree: ReporterTaskSnapshot
      taskPacks?: never
    }
  | {
      kind: 'task-packs-after-collection-failure'
      taskTree?: never
      taskPacks: ReporterTaskPack[]
    }
)

export function assertReporterTaskPacks(
  packs: unknown
): asserts packs is ReporterTaskPack[] {
  if (
    !Array.isArray(packs) ||
    new Set(packs.map((pack) => pack?.[0])).size !== packs.length ||
    packs.some(
      (pack) =>
        !Array.isArray(pack) ||
        pack.length !== 2 ||
        typeof pack[0] !== 'string' ||
        !pack[1] ||
        typeof pack[1] !== 'object' ||
        Object.keys(pack[1]).some(
          (key) => key !== 'result' && key !== 'meta'
        ) ||
        !pack[1].meta ||
        typeof pack[1].meta !== 'object' ||
        (pack[1].result !== undefined &&
          (!pack[1].result ||
            typeof pack[1].result !== 'object' ||
            !['run', 'pass', 'fail', 'skip', 'todo', 'only', 'queued'].includes(
              pack[1].result.state
            )))
    )
  )
    throw new Error('Invalid live reporter task packs.')
}

/** Actual per-task packs share one point-in-time tree before logical callbacks. */
export function createReporterTaskUpdates<
  Result extends { caseId: string } = RunnerCaseResult,
>(options: {
  /** Request actual one-per-logical-case preparation occurrences. */
  captureCaseReady?: true
  /** Defer the existing leading root pack until its actual preparation. */
  captureModuleStart?: true
  /** Reuse only retry data from the actual initial collected snapshot. */
  carriedRetryOptions?: true
  onUpdate(update: ReporterTaskUpdate<Result>): void | Promise<void>
  getTaskLocation?(task: Task): TaskLocation | undefined
}) {
  if (
    options.captureCaseReady !== undefined &&
    options.captureCaseReady !== true
  )
    throw new Error('Invalid reporter case preparation request.')
  if (
    options.captureModuleStart !== undefined &&
    options.captureModuleStart !== true
  )
    throw new Error('Invalid reporter module preparation request.')
  let file: File | undefined
  let filePrepared = false
  const tasks = new Map<string, { task: Task; retry: Test['retry'] }>()
  const preparedSuites = new Set<string>()
  const pendingTasks = new Map<
    string,
    Pick<Task, 'result' | 'meta'> & {
      task: Task
      projectResult?: ReporterTaskResultProjection
    }
  >()
  let hasResultProjections = false
  let caseResults: Result[] = []
  let caseEvents: ReporterCaseEvent[] = []
  const readyCases = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastUpdate = 0
  let disposed = false
  const sends = new Set<Promise<void>>()
  const errors: unknown[] = []
  let collectionFailure:
    | { operation: Promise<void>; error: unknown }
    | undefined

  function getCarriedRetry(task: Test): Test['retry'] {
    const retained = tasks.get(task.id)
    if (retained?.task !== task)
      throw new Error('Reporter retry does not belong to its collected task.')
    return retained.retry
  }

  function captureCollectionFailurePacks(): ReporterTaskPack[] {
    const captured = structuredClone(
      [...pendingTasks].map(
        ([id, pack]): ReporterTaskPack => [
          id,
          { result: pack.result, meta: pack.meta },
        ]
      )
    )
    if (hasResultProjections)
      [...pendingTasks.values()].forEach((pack, index) => {
        if (
          pack.projectResult &&
          projectionCapturesOriginalResult(pack.projectResult)
        )
          pack.projectResult(pack.task, captured[index][1].result, pack.result)
        else pack.projectResult?.(pack.task, captured[index][1].result)
      })
    return captured
  }

  function flush() {
    if (timer !== undefined) realClearTimeout(timer)
    timer = undefined
    if (!file || disposed || !pendingTasks.size) return
    lastUpdate = realDateNow()
    let send: Promise<void>
    try {
      const update: ReporterTaskUpdate<Result> = collectionFailure
        ? {
            kind: 'task-packs-after-collection-failure',
            taskPacks: captureCollectionFailurePacks(),
            taskUpdateIds: [...pendingTasks.keys()],
            caseResults,
          }
        : {
            taskTree: captureReporterTaskTree(
              file,
              pendingTasks,
              options.getTaskLocation,
              options.carriedRetryOptions === true ? getCarriedRetry : undefined
            ),
            taskUpdateIds: [...pendingTasks.keys()],
            caseResults,
            ...(options.captureCaseReady === true ? { caseEvents } : {}),
          }
      pendingTasks.clear()
      hasResultProjections = false
      caseResults = []
      caseEvents = []
      const operation = options.onUpdate(update)
      if (operation === undefined) return
      send = operation
    } catch (error) {
      pendingTasks.clear()
      hasResultProjections = false
      caseResults = []
      caseEvents = []
      errors.push(error)
      return
    }
    sends.add(send)
    try {
      void send.then(
        () => sends.delete(send),
        (error) => {
          errors.push(error)
          sends.delete(send)
        }
      )
    } catch (error) {
      sends.delete(send)
      throw error
    }
  }
  function assertOwned(task: Task) {
    if (disposed || !file) throw new Error('Reporter task owner is not open.')
    if (tasks.get(task.id)?.task !== task)
      throw new Error('Reporter task update does not belong to its file.')
  }
  function schedule(task: Task, projectResult?: ReporterTaskResultProjection) {
    assertOwned(task)
    if (projectResult) {
      pendingTasks.set(task.id, {
        task,
        result: task.result,
        meta: task.meta,
        projectResult,
      })
      hasResultProjections = true
    } else
      pendingTasks.set(task.id, { task, result: task.result, meta: task.meta })
    // Match the actual task-update sender's leading and trailing 100ms throttle.
    const elapsed = realDateNow() - lastUpdate
    if (elapsed > 100) flush()
    else if (timer === undefined) timer = realSetTimeout(flush, 100)
  }
  function collectFile(actualFile: File, carriedTree?: ReporterTaskSnapshot) {
    if (file || disposed)
      throw new Error('Reporter task file already collected.')
    file = actualFile
    function visit(task: Task, carried?: ReporterTaskSnapshot) {
      if (
        options.carriedRetryOptions === true &&
        !collectionFailure &&
        (!carried ||
          carried.id !== task.id ||
          carried.type !== task.type ||
          (task.type === 'suite' &&
            carried.tasks?.length !== task.tasks.length))
      )
        throw new Error('Reporter retry requires its actual collected tree.')
      if (tasks.has(task.id))
        throw new Error('Duplicate reporter task identity.')
      tasks.set(task.id, {
        task,
        retry:
          options.carriedRetryOptions === true &&
          !collectionFailure &&
          task.type === 'test'
            ? carried!.retry
            : undefined,
      })
      if (task.type === 'suite')
        for (const [index, child] of task.tasks.entries())
          visit(child, carried?.tasks?.[index])
    }
    visit(file, carriedTree)
    if (options.captureModuleStart !== true) {
      preparedSuites.add(file.id)
      schedule(file)
    }
  }
  return {
    collected: collectFile,
    collectionFailed(
      actualFile: File,
      operation: Promise<void>,
      error: unknown
    ) {
      if (options.carriedRetryOptions !== true || collectionFailure)
        throw new Error(
          'Reporter collection failure requires its actual owner.'
        )
      collectionFailure = { operation, error }
      errors.push(error)
      collectFile(actualFile)
    },
    filePrepared(actualFile: File) {
      if (
        options.captureModuleStart !== true ||
        actualFile !== file ||
        filePrepared ||
        !actualFile.result ||
        !['run', 'fail', 'skip', 'todo'].includes(actualFile.result.state)
      )
        throw new Error('Reporter module requires its actual prepared File.')
      assertOwned(actualFile)
      filePrepared = true
      preparedSuites.add(actualFile.id)
      schedule(actualFile)
    },
    caseStart(testId: string) {
      if (options.captureModuleStart === true && !filePrepared)
        throw new Error('Reporter case started before actual File preparation.')
      const task = tasks.get(testId)?.task
      if (!task || task.type !== 'test')
        throw new Error('Unknown reporter case start.')
      const ancestors: Suite[] = []
      for (let parent = task.suite; parent; parent = parent.suite)
        ancestors.unshift(parent)
      for (const suite of ancestors)
        if (!preparedSuites.has(suite.id)) {
          preparedSuites.add(suite.id)
          schedule(suite)
        }
      schedule(task)
    },
    caseReady(task: Test) {
      if (options.captureCaseReady !== true)
        throw new Error('Reporter case preparation was not requested.')
      if (options.captureModuleStart === true && !filePrepared)
        throw new Error(
          'Reporter case prepared before actual File preparation.'
        )
      assertOwned(task)
      if (collectionFailure || task.type !== 'test' || readyCases.has(task.id))
        throw new Error('Reporter case readiness requires one actual test.')
      readyCases.add(task.id)
      caseEvents.push({ event: 'ready', caseId: task.id })
      schedule(task)
      // Freeze the actual prepared own state before fixtures, retries or a body
      // can mutate it. Sending stays asynchronous and does not await reporters.
      flush()
    },
    caseResult(task: Test, result: Result) {
      if (options.captureModuleStart === true && !filePrepared)
        throw new Error(
          'Reporter case completed before actual File preparation.'
        )
      assertOwned(task)
      if (task.id !== result.caseId)
        throw new Error('Reporter logical result does not match its task.')
      caseResults.push(result)
      if (options.captureCaseReady === true)
        caseEvents.push({ event: 'result', caseId: task.id })
      schedule(task)
    },
    suiteEnd(task: Suite, projectResult?: ReporterTaskResultProjection) {
      if (options.captureModuleStart === true && !filePrepared)
        throw new Error('Reporter suite ended before actual File preparation.')
      schedule(task, projectResult)
    },
    async finish() {
      if (collectionFailure)
        await Promise.allSettled([collectionFailure.operation])
      flush()
      while (sends.size) await Promise.allSettled([...sends])
      if (errors.length === 1) throw errors[0]
      if (errors.length > 1)
        throw new AggregateError(errors, 'Reporter task updates failed.')
    },
    dispose() {
      if (timer !== undefined) realClearTimeout(timer)
      timer = undefined
      disposed = true
      collectionFailure = undefined
      file = undefined
      tasks.clear()
      pendingTasks.clear()
      hasResultProjections = false
      preparedSuites.clear()
      readyCases.clear()
      caseResults = []
      caseEvents = []
    },
  }
}
