import { debugConsole } from './common'

export type TimeoutGroupOptions = {
  description: string
  maxDuration: number
}

type Task = {
  description: string
  status: 'pending' | 'fulfilled' | 'rejected'
  originalPromiseStatus: 'pending' | 'fulfilled' | 'rejected'
  promiseWithTimeout: Promise<void>
}

const CleanupGroupAsyncStorage = new AsyncLocalStorage<TimeoutGroup>()
const TaskAsyncStorage = new AsyncLocalStorage<Task>()

export class TimeoutGroup {
  groupDescription: string
  maxDuration: number

  status: 'started' | 'waiting' | 'finished' = 'started'
  timedOutTasks = new Set<Task>()
  tasks: Task[] = []

  constructor(options: TimeoutGroupOptions) {
    this.groupDescription = options.description
    this.maxDuration = options.maxDuration
  }

  /** Run a callback in a new timeout group, then error if any tasks in the group exceeded the time limit. */
  static async with(
    options: TimeoutGroupOptions,
    callback: (group: TimeoutGroup) => Promise<void>
  ): Promise<void> {
    const parentGroup = CleanupGroupAsyncStorage.getStore() ?? null
    if (parentGroup) {
      // TODO:
      throw new Error('Nesting timeout groups is not supported.')
    }
    const group = new TimeoutGroup(options)
    debugConsole?.log(`[timeouts] started group '${group.groupDescription}'`)

    // do not await the callback, it may do things that hang indefinitely.
    // instead, we only wait for the timeouts.
    void CleanupGroupAsyncStorage.run(group, () => callback(group))
    await group.waitAndErrorIfTimeout()
  }

  /** Returns the currently active timeout group, or throws if we're not running within one. */
  static get(): TimeoutGroup {
    const group = CleanupGroupAsyncStorage.getStore()
    if (!group) {
      throw new Error('No timeout group available')
    }
    return group
  }

  /** Returns the currently active timeout group, or null if we're not running within one. */
  static getIfAvailable(): TimeoutGroup | null {
    return CleanupGroupAsyncStorage.getStore() ?? null
  }

  /**
   * Run a Playwright cleanup with `force: false`. If it exceeds the time limit,
   * force it by rerunning it with `force: true`, which signals that we should finish promptly.
   * */
  wait<T>(description: string, cleanup: () => Promise<T>): Promise<T> {
    const [task, originalPromise] = this.createTask(
      description,
      cleanup,
      () => {
        // we can't force this cleanup, so error.
        throw new TimeoutError(
          `Exceeded ${this.maxDuration} while ${task.description} (while ${this.groupDescription})`,
          task
        )
      }
    )
    return originalPromise
  }

  /**
   * Run a Playwright cleanup with `force: false`. If it exceeds the time limit,
   * force it by rerunning it with `force: true`, which signals that we should finish promptly.
   * */
  forceIfTimeout(
    description: string,
    cleanup: (force: boolean) => Promise<void>
  ): Promise<void> {
    const [task] = this.createTask(
      description,
      () => cleanup(false),
      async () => {
        console.error(`${task.description} again, but forcing it this time`)
        // force the cleanup.
        await cleanup(true)
      }
    )

    return task.promiseWithTimeout
  }

  private markAsTimedOut(task: Task) {
    this.timedOutTasks.add(task)
    console.error(
      [
        `An operation took longer than ${this.maxDuration} to complete while ${this.groupDescription}:`,
        `  - ${task.description}`,
        `This usually happens with something like a request interceptor that never returns a response.`,
      ].join('\n')
    )
  }

  private createTask<T>(
    description: string,
    execute: () => Promise<T>,
    onTimeout: () => void | Promise<void>
  ): [task: Task, originalPromise: Promise<T>] {
    const parentTask = TaskAsyncStorage.getStore()
    if (parentTask) {
      description = parentTask.description + ' > ' + description
    } else {
      description = this.groupDescription + ' > ' + description
    }

    if (this.status === 'finished') {
      console.error(
        `task '${description}' was added after the timeout group finished waiting.`
      )
    }

    debugConsole?.log(`[timeouts] started task '${description}'`)

    const task: Task = {
      description,
      status: 'pending',
      promiseWithTimeout: null!,
      originalPromiseStatus: 'pending',
    }

    const originalPromise = TaskAsyncStorage.run(task, () => execute())

    const promiseWithTimeout = withTimeout(
      originalPromise.then(() => {}),
      {
        duration: this.maxDuration,
        onTimeout: () => {
          this.markAsTimedOut(task)
          if (this.status === 'finished') {
            throw new TimeoutError(
              `task '${description}' timed out after the timeout group finished waiting`,
              task
            )
          }
          return onTimeout()
        },
      }
    )

    task.promiseWithTimeout = promiseWithTimeout

    promiseWithTimeout.then(
      () => {
        task.status = 'fulfilled'
        logResult?.('task succeeded')
      },
      (err) => {
        task.status = 'rejected'
        if (isTimeoutError(err)) {
          logResult?.('task timed out')
          if (this.status === 'finished') {
            console.error(
              `task '${description}' timed out after the timeout group finished waiting`,
              err
            )
            throw err
          }
        } else {
          // this was already thrown on the original promise, we don't need to rethrow it here.
          logResult?.('task failed')
        }
      }
    )

    originalPromise.then(
      () => {
        task.originalPromiseStatus = 'fulfilled'
        // avoid logging this before .then() had a chance to run.
        if (task.status !== 'pending') {
          logResult?.('the original promise succeeded for task')
        }
      },
      (err) => {
        task.originalPromiseStatus = 'rejected'
        if (task.status !== 'pending') {
          logResult?.('the original promise rejected for task')
          console.error(`task '${description}' rejected after timeing out`, err)
          throw err
        }
      }
    )

    const logResult = !debugConsole
      ? undefined
      : (message: string) => {
          // TODO: original promises too
          const pendingTaskCount = this.tasks.filter(
            (task) => task.status === 'pending'
          ).length
          debugConsole?.log(
            `[timeouts] ${message} '${description}' (${pendingTaskCount} tasks remaining)`
          )
        }

    this.tasks.push(task)
    return [task, originalPromise]
  }

  private async waitAndErrorIfTimeout() {
    if (this.status !== 'started') {
      throw new Error(
        `Invariant: timeout group ${this.groupDescription} was already awaited.`
      )
    }

    this.status = 'waiting'

    const erroredTasks = await this.waitForPendingTasks()

    if (debugConsole) {
      debugConsole.log(
        `[timeouts] finished waiting for all tasks in group '${this.groupDescription}' ` +
          ` ${this.getTaskStats()}`
      )
      debugConsole.log('='.repeat(80))
    }
    this.status = 'finished'
    if (erroredTasks.size > 0) {
      throw new AggregateError(
        Object.values(erroredTasks),
        `Errors occured while ${this.groupDescription}`
      )
    }

    if (this.timedOutTasks.size === 0) {
      return
    }
    throw new Error(
      [
        // TODO: original promises too
        `Some operations took longer than ${this.maxDuration}ms to complete while ${this.groupDescription}`,
        ...Array.from(this.timedOutTasks).map(
          (task) => `  - ${task.description}`
        ),
        `This usually happens with something like a request interceptor that never returns a response.`,
      ].join('\n')
    )
  }

  private async waitForPendingTasks() {
    // repeatedly await pending tasks until we run out of them --
    // a task finishing can spawn more tasks, so we do it in a loop.
    //
    // if a task's `originalPromise` ends up spawning more tasks after its `promiseWithTimeout` settled,
    // we might miss that task here, so it'll become "orphaned".
    // but we can't do anything about that, because tasks may hang indefinitely, and we can't wait that long.
    // if that happens, the orphaned task will trigger an unhandled rejection when timing out,
    // so the error will still get reported.
    const erroredTasks = new Map<Task, unknown>()
    let i = 1
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      const pendingTasks = this.tasks.filter(
        (task) => task.status === 'pending'
      )

      if (debugConsole) {
        debugConsole.log(
          `[timeouts] waiting for tasks in group '${this.groupDescription}' - iteration ${i}` +
            ` (${this.getTaskStats()})`
        )
      }

      if (pendingTasks.length === 0) {
        break
      }

      const removeTimeoutPoller = (() => {
        let interval: ReturnType<typeof setInterval> | null = null
        const timeout = setTimeout(() => {
          interval = setInterval(() => {
            debugConsole?.log(
              [
                '[timeouts] some tasks are taking a long time to settle',
                ...pendingTasks
                  .filter((task) => task.status === 'pending')
                  .map((task) => `  - ${task.description}`),
              ].join('\n')
            )
          }, 3_000)
        }, this.maxDuration)

        return () => {
          clearTimeout(timeout)
          if (interval) clearInterval(interval)
        }
      })()

      const results = await Promise.allSettled(
        pendingTasks.map((task) => task.promiseWithTimeout)
      )

      removeTimeoutPoller()

      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        if (result.status === 'rejected') {
          const err = result.reason
          if (!isTimeoutError(err)) {
            const task = pendingTasks[i]
            erroredTasks.set(task, err)
          }
        }
      }

      i++
    }
    return erroredTasks
  }
  private getTaskStats() {
    const total = this.tasks.length
    const timedOut = this.timedOutTasks.size
    const pending = this.tasks.filter(
      (task) => task.status === 'pending'
    ).length
    const unfinished = this.tasks.filter(
      (task) =>
        task.originalPromiseStatus === 'pending' && task.status !== 'pending'
    ).length

    return `${total} total, ${pending} pending, ${timedOut} timed out, ${unfinished} did not finish)`
  }
}

function isTimeoutError(value: unknown): value is TimeoutError {
  return !!(value && typeof value === 'object' && value instanceof TimeoutError)
}

class TimeoutError extends Error {
  task: Task
  constructor(message: string, task: Task) {
    super(message)
    this.task = task
  }
}

export function withTimeout<T, U>(
  task: Promise<T> | (() => Promise<T>),
  options: { duration: number; onTimeout: (originalPromise: Promise<T>) => U }
): Promise<T | Awaited<U>> {
  return new Promise<T | Awaited<U>>(async (resolve, reject) => {
    let settled = false
    const NO_RESULT = Symbol('NO_RESULT')
    let onTimeoutReturned: U | typeof NO_RESULT = NO_RESULT

    const timeoutId = setTimeout(async () => {
      settled = true
      try {
        onTimeoutReturned = options.onTimeout(promise)
        resolve(await onTimeoutReturned)
      } catch (err) {
        reject(err)
      }
    }, options.duration)

    const promise = typeof task === 'function' ? task() : task
    try {
      const result = await promise
      if (!settled) {
        resolve(result)
      }
    } catch (err) {
      if (!settled) {
        reject(err)
      } else {
        // if onTimeout returned the same promise, then we've already awaited it there,
        // so there's no need to reject again.
        if (onTimeoutReturned !== NO_RESULT && onTimeoutReturned !== promise) {
          throw new Error('A promise rejected after timing out', { cause: err })
        }
      }
    } finally {
      settled = true
      clearTimeout(timeoutId)
    }
  })
}
