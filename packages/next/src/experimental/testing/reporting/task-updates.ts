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

export interface ReporterHookEvent {
  event: 'hook-start' | 'hook-end'
  taskId: string
  hook: 'beforeAll' | 'afterAll' | 'beforeEach' | 'afterEach'
}

export type ReporterTaskEvent =
  | { event: 'case-ready' | 'case-result'; caseId: string }
  | { event: 'suite-ready' | 'suite-result'; suiteId: string }
  | ReporterHookEvent

export function projectReporterCaseEvents(
  events: ReporterTaskEvent[] | undefined
): ReporterCaseEvent[] | undefined {
  if (events === undefined) return
  if (!Array.isArray(events))
    throw new Error('Invalid live reporter task occurrences.')
  return events.flatMap((occurrence) =>
    occurrence?.event === 'case-ready' || occurrence?.event === 'case-result'
      ? [
          {
            event:
              occurrence.event === 'case-ready'
                ? ('ready' as const)
                : ('result' as const),
            caseId: occurrence.caseId,
          },
        ]
      : []
  )
}

/** Suite occurrences require their actual preparation and completion facts. */
export function assertReporterTaskEvents(
  value: unknown,
  options: {
    caseIds: ReadonlySet<string>
    suiteIds: ReadonlySet<string>
    taskUpdateIds: readonly string[]
    caseEvents?: readonly ReporterCaseEvent[]
    readySuites: Set<string>
    completedSuites: Set<string>
    finishedSuiteIds: ReadonlySet<string>
    /** Actual Suite IDs plus the root File; All hooks cannot belong to a Test. */
    hookSuiteIds?: ReadonlySet<string>
    /** Counts permit repeated ancestor/retry groups and rejected unmatched starts. */
    activeHooks?: Map<string, number>
  }
): asserts value is ReporterTaskEvent[] | undefined {
  if (value === undefined) return
  if (!Array.isArray(value))
    throw new Error('Invalid live reporter task occurrences.')
  const ready = new Set(options.readySuites)
  const completed = new Set(options.completedSuites)
  const hooks = new Map(options.activeHooks)
  for (const occurrence of value) {
    if (!occurrence || typeof occurrence !== 'object')
      throw new Error('Invalid live reporter task occurrence.')
    if (
      occurrence.event === 'case-ready' ||
      occurrence.event === 'case-result'
    ) {
      if (
        Object.keys(occurrence).length !== 2 ||
        typeof occurrence.caseId !== 'string' ||
        !options.caseIds.has(occurrence.caseId) ||
        !options.taskUpdateIds.includes(occurrence.caseId)
      )
        throw new Error('Invalid live reporter case occurrence owner.')
    } else if (
      occurrence.event === 'suite-ready' ||
      occurrence.event === 'suite-result'
    ) {
      const id = occurrence.suiteId
      if (
        Object.keys(occurrence).length !== 2 ||
        typeof id !== 'string' ||
        !options.suiteIds.has(id) ||
        !options.taskUpdateIds.includes(id)
      )
        throw new Error('Invalid live reporter suite occurrence owner.')
      if (occurrence.event === 'suite-ready') {
        if (ready.has(id) || completed.has(id))
          throw new Error(
            'Duplicate or completed live reporter suite readiness.'
          )
        ready.add(id)
      } else {
        if (
          !ready.has(id) ||
          completed.has(id) ||
          !options.finishedSuiteIds.has(id)
        )
          throw new Error(
            'Suite result requires its actual prepared and finished suite.'
          )
        completed.add(id)
      }
    } else if (
      occurrence.event === 'hook-start' ||
      occurrence.event === 'hook-end'
    ) {
      if (
        Object.keys(occurrence).length !== 3 ||
        !Object.hasOwn(occurrence, 'event') ||
        !Object.hasOwn(occurrence, 'taskId') ||
        !Object.hasOwn(occurrence, 'hook') ||
        typeof occurrence.taskId !== 'string' ||
        !options.taskUpdateIds.includes(occurrence.taskId) ||
        !options.activeHooks ||
        !['beforeAll', 'afterAll', 'beforeEach', 'afterEach'].includes(
          occurrence.hook
        ) ||
        (occurrence.hook.endsWith('Each')
          ? !options.caseIds.has(occurrence.taskId)
          : !options.hookSuiteIds?.has(occurrence.taskId))
      )
        throw new Error('Invalid live reporter hook occurrence owner.')
      const key = JSON.stringify([occurrence.taskId, occurrence.hook])
      const active = hooks.get(key) ?? 0
      if (occurrence.event === 'hook-start') hooks.set(key, active + 1)
      else {
        if (!active)
          throw new Error('Hook end requires its actual preceding hook group.')
        if (active === 1) hooks.delete(key)
        else hooks.set(key, active - 1)
      }
    } else throw new Error('Invalid live reporter task occurrence.')
  }
  if (options.caseEvents !== undefined) {
    const cases = projectReporterCaseEvents(value)!
    if (
      cases.length !== options.caseEvents.length ||
      cases.some(
        (item, index) =>
          item.event !== options.caseEvents![index].event ||
          item.caseId !== options.caseEvents![index].caseId
      )
    )
      throw new Error(
        'Live reporter task occurrences differ from case occurrences.'
      )
  }
  for (const id of ready) options.readySuites.add(id)
  for (const id of completed) options.completedSuites.add(id)
  if (options.activeHooks) {
    options.activeHooks.clear()
    for (const [key, count] of hooks) options.activeHooks.set(key, count)
  }
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
  /** Ordered actual suite and hook transitions; absent in legacy producers. */
  taskEvents?: ReporterTaskEvent[]
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
  captureSuiteEvents?: true
  captureHookEvents?: true
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
  for (const capture of [options.captureSuiteEvents, options.captureHookEvents])
    if (capture !== undefined && capture !== true)
      throw new Error('Invalid reporter suite or hook capture request.')
  const captureTaskEvents =
    options.captureSuiteEvents === true || options.captureHookEvents === true
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
  let taskEvents: ReporterTaskEvent[] = []
  const readySuites = new Set<string>()
  const completedSuites = new Set<string>()
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
            ...(options.captureCaseReady === true || captureTaskEvents
              ? { caseEvents }
              : {}),
            ...(captureTaskEvents ? { taskEvents } : {}),
          }
      pendingTasks.clear()
      hasResultProjections = false
      caseResults = []
      caseEvents = []
      taskEvents = []
      const operation = options.onUpdate(update)
      if (operation === undefined) return
      send = operation
    } catch (error) {
      pendingTasks.clear()
      hasResultProjections = false
      caseResults = []
      caseEvents = []
      taskEvents = []
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
    hookOccurrence(
      task: Test | Suite,
      hook: ReporterHookEvent['hook'],
      event: ReporterHookEvent['event']
    ) {
      assertOwned(task)
      if (
        options.captureHookEvents !== true ||
        collectionFailure ||
        !['hook-start', 'hook-end'].includes(event) ||
        !['beforeAll', 'afterAll', 'beforeEach', 'afterEach'].includes(hook) ||
        (hook.endsWith('Each') ? task.type !== 'test' : task.type !== 'suite')
      )
        throw new Error('Reporter hook occurrence requires its actual task.')
      taskEvents.push({ event, taskId: task.id, hook })
      schedule(task)
    },
    suiteReady(task: Suite) {
      assertOwned(task)
      if (
        options.captureSuiteEvents !== true ||
        task === file ||
        task.type !== 'suite' ||
        readySuites.has(task.id)
      )
        throw new Error('Reporter suite readiness requires one actual suite.')
      readySuites.add(task.id)
      preparedSuites.add(task.id)
      taskEvents.push({ event: 'suite-ready', suiteId: task.id })
      schedule(task)
    },
    caseReady(task: Test) {
      if (options.captureCaseReady !== true && !captureTaskEvents)
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
      if (captureTaskEvents)
        taskEvents.push({ event: 'case-ready', caseId: task.id })
      schedule(task)
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
      if (options.captureCaseReady === true || captureTaskEvents)
        caseEvents.push({ event: 'result', caseId: task.id })
      if (captureTaskEvents)
        taskEvents.push({ event: 'case-result', caseId: task.id })
      schedule(task)
    },
    suiteEnd(task: Suite, projectResult?: ReporterTaskResultProjection) {
      if (options.captureModuleStart === true && !filePrepared)
        throw new Error('Reporter suite ended before actual File preparation.')
      if (options.captureSuiteEvents === true && readySuites.has(task.id)) {
        if (completedSuites.has(task.id))
          throw new Error('Duplicate reporter suite result.')
        completedSuites.add(task.id)
        taskEvents.push({ event: 'suite-result', suiteId: task.id })
      }
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
      readySuites.clear()
      completedSuites.clear()
      caseResults = []
      caseEvents = []
      taskEvents = []
    },
  }
}
