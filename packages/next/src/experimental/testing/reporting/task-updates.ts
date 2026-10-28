import type { RunnerCaseResult } from '../runner/lifecycle'
import type { File, Task, TaskLocation, Test, Suite } from '../runner/tasks'
import {
  captureReporterTaskTree,
  type ReporterTaskSnapshot,
} from './live-tasks'

// Capture before authored fake clocks can replace the execution realm's globals.
const realDateNow = Date.now.bind(Date)
const realSetTimeout = globalThis.setTimeout.bind(globalThis)
const realClearTimeout = globalThis.clearTimeout.bind(globalThis)

export interface ReporterTaskUpdate<Result = RunnerCaseResult> {
  taskTree: ReporterTaskSnapshot
  taskUpdateIds: string[]
  caseResults: Result[]
}

/** Actual per-task packs share one point-in-time tree before logical callbacks. */
export function createReporterTaskUpdates<
  Result extends { caseId: string } = RunnerCaseResult,
>(options: {
  /** Defer the existing leading root pack until its actual preparation. */
  captureModuleStart?: true
  onUpdate(update: ReporterTaskUpdate<Result>): void | Promise<void>
  getTaskLocation?(task: Task): TaskLocation | undefined
}) {
  if (
    options.captureModuleStart !== undefined &&
    options.captureModuleStart !== true
  )
    throw new Error('Invalid reporter module preparation request.')
  let file: File | undefined
  let filePrepared = false
  const tasks = new Map<string, Task>()
  const preparedSuites = new Set<string>()
  const pendingTasks = new Map<
    string,
    Pick<Task, 'result' | 'meta'> & { task: Task }
  >()
  let caseResults: Result[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastUpdate = 0
  let disposed = false
  const sends = new Set<Promise<void>>()
  const errors: unknown[] = []

  function flush() {
    if (timer !== undefined) realClearTimeout(timer)
    timer = undefined
    if (!file || disposed || !pendingTasks.size) return
    lastUpdate = realDateNow()
    let send: Promise<void>
    try {
      const update = {
        taskTree: captureReporterTaskTree(
          file,
          pendingTasks,
          options.getTaskLocation
        ),
        taskUpdateIds: [...pendingTasks.keys()],
        caseResults,
      }
      pendingTasks.clear()
      caseResults = []
      send = Promise.resolve(options.onUpdate(update))
    } catch (error) {
      pendingTasks.clear()
      caseResults = []
      errors.push(error)
      return
    }
    sends.add(send)
    void send.then(
      () => sends.delete(send),
      (error) => {
        errors.push(error)
        sends.delete(send)
      }
    )
  }
  function assertOwned(task: Task) {
    if (disposed || !file) throw new Error('Reporter task owner is not open.')
    if (tasks.get(task.id) !== task)
      throw new Error('Reporter task update does not belong to its file.')
  }
  function schedule(task: Task) {
    assertOwned(task)
    pendingTasks.set(task.id, { task, result: task.result, meta: task.meta })
    // Match the actual task-update sender's leading and trailing 100ms throttle.
    const elapsed = realDateNow() - lastUpdate
    if (elapsed > 100) flush()
    else if (timer === undefined) timer = realSetTimeout(flush, 100)
  }
  return {
    collected(actualFile: File) {
      if (file || disposed)
        throw new Error('Reporter task file already collected.')
      file = actualFile
      function visit(task: Task) {
        if (tasks.has(task.id))
          throw new Error('Duplicate reporter task identity.')
        tasks.set(task.id, task)
        if (task.type === 'suite') for (const child of task.tasks) visit(child)
      }
      visit(file)
      if (options.captureModuleStart !== true) {
        preparedSuites.add(file.id)
        schedule(file)
      }
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
      const task = tasks.get(testId)
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
    caseResult(task: Test, result: Result) {
      if (options.captureModuleStart === true && !filePrepared)
        throw new Error(
          'Reporter case completed before actual File preparation.'
        )
      assertOwned(task)
      if (task.id !== result.caseId)
        throw new Error('Reporter logical result does not match its task.')
      caseResults.push(result)
      schedule(task)
    },
    suiteEnd(task: Suite) {
      if (options.captureModuleStart === true && !filePrepared)
        throw new Error('Reporter suite ended before actual File preparation.')
      schedule(task)
    },
    async finish() {
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
      file = undefined
      tasks.clear()
      pendingTasks.clear()
      preparedSuites.clear()
      caseResults = []
    },
  }
}
