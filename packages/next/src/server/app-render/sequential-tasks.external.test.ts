import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'
import {
  scheduleTask,
  cancelTask,
  expectNoPendingTasks,
} from './sequential-tasks.external'

function createLogger() {
  const logs: string[] = []

  const log = (...args: any[]) => {
    const { inspect } = require('node:util') as typeof import('node:util')
    const { writeFileSync } = require('node:fs') as typeof import('node:fs')

    let logLine = args
      .map((arg) =>
        typeof arg === 'string' ? arg : inspect(arg, { colors: false })
      )
      .join(' ')

    logs.push(logLine)
    writeFileSync(process.stdout.fd, logLine + '\n')
  }
  return { logs, log }
}

afterEach(() => {
  expectNoPendingTasks()
})

it('runs sequential tasks without interruption with timeouts or immediates', async () => {
  const { log, logs } = createLogger()

  function taskBody(id: string, resolve?: () => void) {
    log(`task ${id}`)
    process.nextTick(() => {
      log(`task ${id} > nextTick`)
    })
    queueMicrotask(() => {
      log(`task ${id} > microtask`)
      process.nextTick(() => {
        log(`task ${id} > microtask > nextTick`)
        queueMicrotask(() => {
          log(`task ${id} > microtask > nextTick > microtask`)
        })
      })
    })
    setImmediate(() => {
      log(`task ${id} > immediate`)
    })
    setTimeout(() => {
      log(`task ${id} > timeout`)
      resolve?.()
    })
  }

  const done = createPromiseWithResolvers<void>()
  // run in a fresh task, outside the test.
  setImmediate(() => {
    queueMicrotask(() => {
      log('microtask')
      process.nextTick(() => {
        log('microtask > nextTick')
      })
    })
    scheduleTask(() => {
      taskBody('1')
    })
    scheduleTask(() => {
      cancelTask(t)
      taskBody('2')
    })
    const t = scheduleTask(() => {
      taskBody('never')
    })
    scheduleTask(() => {
      cancelTask(t)
      taskBody('3', done.resolve)
    })
  })

  await done.promise

  expect(logs).toEqual([
    'microtask',
    'microtask > nextTick',
    'task 1',
    'task 1 > nextTick',
    'task 1 > microtask',
    'task 1 > microtask > nextTick',
    'task 1 > microtask > nextTick > microtask',
    //======================
    'task 2',
    'task 2 > nextTick',
    'task 2 > microtask',
    'task 2 > microtask > nextTick',
    'task 2 > microtask > nextTick > microtask',
    //======================
    'task 3',
    'task 3 > nextTick',
    'task 3 > microtask',
    'task 3 > microtask > nextTick',
    'task 3 > microtask > nextTick > microtask',
    //======================
    'task 1 > immediate',
    'task 2 > immediate',
    'task 3 > immediate',
    //======================
    'task 1 > timeout',
    'task 2 > timeout',
    'task 3 > timeout',
  ])
})

type TriggeredUncaught = {
  error: unknown
  kind: 'uncaughtException' | 'unhandledRejection'
}

const trackUncaughtErrors = (
  handler: (
    error: unknown,
    kind: 'uncaughtException' | 'unhandledRejection'
  ) => void
) => {
  // We have to use this instead of `process.on("uncaughtException")`,
  // because if an actual "uncaughtException" event fires, Jest will fail the test.
  const onUncaughtException = (err: unknown) => {
    handler(err, 'uncaughtException')
  }
  process.setUncaughtExceptionCaptureCallback(onUncaughtException)

  // If an unhandled rejection occurs, Jest will fail the test.
  // Here, we're triggering one deliberately, so we need to work around Jest's behavior.
  // This seems to be the best we can do, and there's no official solution:
  // https://github.com/jestjs/jest/issues/5620
  const prevListeners = process.rawListeners('unhandledRejection')
  process.removeAllListeners('unhandledRejection')
  const onUnhandledRejection = (err: unknown) => {
    handler(err, 'unhandledRejection')
  }
  process.on('unhandledRejection', onUnhandledRejection)

  return {
    [Symbol.dispose]() {
      process.setUncaughtExceptionCaptureCallback(null)

      process.off('unhandledRejection', onUnhandledRejection)
      for (const listener of prevListeners) {
        process.on(
          'unhandledRejection',
          listener as NodeJS.UnhandledRejectionListener
        )
      }
    },
  }
}

it('runs all queued tasks regardless of errors', async () => {
  const { log, logs } = createLogger()

  let triggeredError: TriggeredUncaught | undefined = undefined
  using _ = trackUncaughtErrors((error, kind) => {
    triggeredError = { error, kind }
  })

  const done1 = createPromiseWithResolvers<void>()
  const done2 = createPromiseWithResolvers<void>()

  const error = new Error('kaboom')

  // run in a fresh task, outside the test.
  setImmediate(() => {
    scheduleTask(() => {
      log('task 1')
      setImmediate(() => {
        log('task 1 > immediate')
        done1.resolve()
      })
    })
    scheduleTask(() => {
      log('task 2')
      throw error
    })
    scheduleTask(() => {
      log('task 3')
      done2.resolve()
    })
  })

  await Promise.all([done1.promise, done2.promise])

  expect(logs).toEqual(['task 1', 'task 2', 'task 3', 'task 1 > immediate'])
  expect(triggeredError).toEqual({ error, kind: 'uncaughtException' })
})

it('runs tasks spawned from other tasks before timeouts or immediates', async () => {
  // NOTE: in Node, this seems to be limited to 333 tasks we can run
  // before the event loop decides to yield to something else.

  const { log, logs } = createLogger()

  function taskBody(id: string, resolve?: () => void) {
    log(`task ${id}`)
    process.nextTick(() => {
      log(`task ${id} > nextTick`)
    })
    queueMicrotask(() => {
      log(`task ${id} > microtask`)
      process.nextTick(() => {
        log(`task ${id} > microtask > nextTick`)
        queueMicrotask(() => {
          log(`task ${id} > microtask > nextTick > microtask`)
        })
      })
    })
    setImmediate(() => {
      log(`task ${id} > immediate`)
    })
    setTimeout(() => {
      log(`task ${id} > timeout`)
      resolve?.()
    })
  }

  const done = createPromiseWithResolvers<void>()
  // run in a fresh task, outside the test.
  setImmediate(() => {
    scheduleTask(() => {
      taskBody('1')
      scheduleTask(() => {
        cancelTask(t)
        taskBody('2')
        queueMicrotask(() => {
          scheduleTask(() => {
            taskBody('3', done.resolve)
          })
        })
      })
      const t = scheduleTask(() => {
        taskBody('never')
      })
    })
  })

  await done.promise

  expect(logs).toEqual([
    'task 1',
    'task 1 > nextTick',
    'task 1 > microtask',
    'task 1 > microtask > nextTick',
    'task 1 > microtask > nextTick > microtask',
    //======================
    'task 2',
    'task 2 > nextTick',
    'task 2 > microtask',
    'task 2 > microtask > nextTick',
    'task 2 > microtask > nextTick > microtask',
    //======================
    'task 3',
    'task 3 > nextTick',
    'task 3 > microtask',
    'task 3 > microtask > nextTick',
    'task 3 > microtask > nextTick > microtask',
    //======================
    'task 1 > immediate',
    'task 2 > immediate',
    'task 3 > immediate',
    //======================
    'task 1 > timeout',
    'task 2 > timeout',
    'task 3 > timeout',
  ])
})

//==========================================
// NOTE: the test should run last!
// it checks if the message channel doesn't block shutdown.
// in case we don't clean up properly, the test will pass, but jest will hang when exiting.
it('does not hang if a task is scheduled and immediately cancelled', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()

  // run in a fresh task, outside the test.
  setImmediate(() => {
    const task = scheduleTask(() => {
      log('never')
    })
    cancelTask(task)
    setTimeout(() => {
      done.resolve()
    })
  })

  await done.promise

  expect(logs).toEqual([])
})
