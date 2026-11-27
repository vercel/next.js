import { AsyncLocalStorage } from 'node:async_hooks'
import { createPromiseWithResolvers } from '../../../shared/lib/promise-with-resolvers'
import * as fsPromises from 'node:fs/promises'

import * as TimerScheduler from './timer-scheduler'

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

function runInNewTask(callback: () => void) {
  setImmediate(callback)
}

// NOTE: fast-set-immediate.external.test.ts includes more scenarios
// that exercise task scheduling and fast immediates together.

describe.each([
  { description: 'Timer scheduler', scheduler: TimerScheduler },
  // (more coming soon)
])('$description', ({ scheduler }) => {
  const { scheduleSequentialTasks } = scheduler

  it('runs sequential tasks without interruption with IO, timeouts, or immediates', async () => {
    const { log, logs } = createLogger()

    function taskBody(id: string, resolve: () => void) {
      let pending = 0
      const finishPending = () => {
        pending--
        if (pending === 0) {
          resolve?.()
        }
      }

      log(`task ${id}`)
      process.nextTick(() => {
        log(`task ${id} > nextTick 1`)
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

      process.nextTick(() => {
        log(`task ${id} > nextTick 2`)
      })

      pending++
      fsPromises.readFile(__filename).then(() => {
        log(`task ${id} > file IO`)
        finishPending()
      })

      pending++
      setImmediate(() => {
        log(`task ${id} > immediate`)
        finishPending()
      })

      pending++
      setTimeout(() => {
        log(`task ${id} > timeout`)
        finishPending()
      })
    }

    const dones = [
      createPromiseWithResolvers<void>(),
      createPromiseWithResolvers<void>(),
      createPromiseWithResolvers<void>(),
    ]
    const controller = new AbortController()
    runInNewTask(() => {
      queueMicrotask(() => {
        log('microtask')
        process.nextTick(() => {
          log('microtask > nextTick')
        })
      })
      scheduleSequentialTasks(
        [
          () => {
            taskBody('1', dones[0].resolve)
          },
          () => {
            taskBody('2', dones[1].resolve)
          },
          () => {
            taskBody('3', dones[2].resolve)
            controller.abort()
          },
          () => {
            taskBody('never', () => {})
          },
        ],
        controller.signal
      )
    })

    await Promise.all(dones.map((ctrl) => ctrl.promise))

    const logsWithinSequentialTasks = [
      'microtask',
      'microtask > nextTick',
      //======================
      'task 1',
      'task 1 > nextTick 1',
      'task 1 > nextTick 2',
      'task 1 > microtask',
      'task 1 > microtask > nextTick',
      'task 1 > microtask > nextTick > microtask',
      //======================
      'task 2',
      'task 2 > nextTick 1',
      'task 2 > nextTick 2',
      'task 2 > microtask',
      'task 2 > microtask > nextTick',
      'task 2 > microtask > nextTick > microtask',
      //======================
      'task 3',
      'task 3 > nextTick 1',
      'task 3 > nextTick 2',
      'task 3 > microtask',
      'task 3 > microtask > nextTick',
      'task 3 > microtask > nextTick > microtask',
    ]
    const logsAfterSequentialTasks = [
      'task 1 > immediate',
      'task 2 > immediate',
      'task 3 > immediate',
      //======================
      'task 1 > file IO',
      'task 2 > file IO',
      'task 3 > file IO',
      //======================
      'task 1 > timeout',
      'task 2 > timeout',
      'task 3 > timeout',
    ]

    expect(logs.slice(0, logsWithinSequentialTasks.length)).toEqual(
      logsWithinSequentialTasks
    )

    // File IO and timeouts can arrive in varying orders.
    // We don't care what order tasky IO happens in, as long
    // as it doesn't happen within the sequential tasks.
    expect(logs.slice(logsWithinSequentialTasks.length).sort()).toEqual(
      [...logsAfterSequentialTasks].sort()
    )
  })

  describe('async context propagation', () => {
    it('propagates AsyncLocalStorage from scheduling to every task', async () => {
      const { log, logs } = createLogger()
      const done = createPromiseWithResolvers<void>()
      const Ctx = new AsyncLocalStorage<string>()

      await Ctx.run('hello', async () => {
        await Promise.resolve()

        scheduleSequentialTasks([
          () => {
            log(`task 1 :: ${Ctx.getStore()}`)
          },
          () => {
            log(`task 2 :: ${Ctx.getStore()}`)
            done.resolve()
          },
        ])
      })

      expect(Ctx.getStore()).toBeUndefined()
      await done.promise

      expect(logs).toEqual([
        'task 1 :: hello',
        //======================
        'task 2 :: hello',
      ])
      expect(Ctx.getStore()).toBeUndefined()
    })

    it('preserves AsyncLocalStorage in nextTicks and microtasks scheduled by tasks', async () => {
      const { log, logs } = createLogger()
      const done = createPromiseWithResolvers<void>()
      const Ctx = new AsyncLocalStorage<string>()

      await Ctx.run('outer', async () => {
        await Promise.resolve()
        scheduleSequentialTasks([
          () => {
            log(`task 1 :: ${Ctx.getStore()}`)
            Ctx.run('inner', () => {
              process.nextTick(() => {
                log(`task 1 -> inner nextTick :: ${Ctx.getStore()}`)
              })
              queueMicrotask(() => {
                log(`task 1 -> inner microtask :: ${Ctx.getStore()}`)
              })
            })
            process.nextTick(() => {
              log(`task 1 -> outer nextTick :: ${Ctx.getStore()}`)
            })
            queueMicrotask(() => {
              log(`task 1 -> outer microtask :: ${Ctx.getStore()}`)
            })
          },
          () => {
            log(`task 2 :: ${Ctx.getStore()}`)
            done.resolve()
          },
        ])
      })

      await done.promise

      expect(logs).toEqual([
        'task 1 :: outer',
        'task 1 -> inner nextTick :: inner',
        'task 1 -> outer nextTick :: outer',
        'task 1 -> inner microtask :: inner',
        'task 1 -> outer microtask :: outer',
        //======================
        'task 2 :: outer',
      ])
    })
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
    using _uncaught = trackUncaughtErrors((error, kind) => {
      triggeredError = { error, kind }
    })

    const done1 = createPromiseWithResolvers<void>()
    const done2 = createPromiseWithResolvers<void>()

    const error = new Error('kaboom')

    runInNewTask(() => {
      scheduleSequentialTasks([
        () => {
          log('task 1')
          setImmediate(() => {
            log('task 1 > immediate')
            done1.resolve()
          })
        },
        () => {
          log('task 2')
          throw error
        },
        () => {
          log('task 3')
          done2.resolve()
        },
      ])
    })

    await Promise.all([done1.promise, done2.promise])

    expect(logs).toEqual(['task 1', 'task 2', 'task 3', 'task 1 > immediate'])
    expect(triggeredError).toEqual({ error, kind: 'uncaughtException' })
  })
})

describe('Timer scheduler', () => {
  // After each test we reset the module-level flag we set when we detect
  // unexpected scheduling behavior.
  const getScheduler = () => import('./timer-scheduler')
  afterEach(() => {
    jest.resetModules()
  })

  it('warns if setTimeout does not have _idleStart', async () => {
    const { scheduleSequentialTasks } = await getScheduler()
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    using _s = deferSync(() => consoleWarnSpy.mockRestore())

    const originalSetTimeout = globalThis.setTimeout
    const setTimeoutWithoutIdleStart = jest.fn(
      (callback: (...args: any[]) => any, duration = 0, ...args: any[]) => {
        const timeout = originalSetTimeout(
          callback,
          duration,
          ...args
        ) as unknown as NodeJS.Timeout

        return new Proxy(timeout, {
          has(target, prop) {
            if (prop === '_idleStart') {
              return false
            }
            return Reflect.has(target, prop)
          },
          get(target, prop, receiver) {
            if (prop === '_idleStart') {
              return undefined
            }
            return Reflect.get(target, prop, receiver)
          },
        })
      }
    )

    const setTimeoutSpy = jest
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation(setTimeoutWithoutIdleStart)
    using _t = deferSync(() => setTimeoutSpy.mockRestore())

    runInNewTask(() => {
      scheduleSequentialTasks([
        () => {
          log('task 1')
        },
        () => {
          log('task 2')
        },
        () => {
          log('task 3')
          done.resolve()
        },
      ])
    })

    await done.promise

    // Sanity check that we successfully mocked setTimeout
    expect(setTimeoutWithoutIdleStart).toHaveBeenCalled()

    expect(logs).toEqual(['task 1', 'task 2', 'task 3'])

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Next.js cannot guarantee that Cache Components will run as expected'
      )
    )
  })

  it('warns if setTimeout and setImmediate interleave', async () => {
    const { scheduleSequentialTasks } = await getScheduler()
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    using _s = deferSync(() => consoleWarnSpy.mockRestore())

    const originalSetTimeout = globalThis.setTimeout

    let setTimeoutCalls = 0
    const setTimeoutWithoutIdleStart = jest.fn(
      (callback: (...args: any[]) => any, duration = 0, ...args: any[]) => {
        setTimeoutCalls++
        return originalSetTimeout(
          callback,
          // Delay timeouts after the second one to simulate
          // Node.js yielding to the event loop and running immediates
          // before some of the timeouts
          setTimeoutCalls > 2 ? duration + 100 : duration,
          ...args
        ) as unknown as NodeJS.Timeout
      }
    )

    const setTimeoutSpy = jest
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation(setTimeoutWithoutIdleStart)
    using _t = deferSync(() => setTimeoutSpy.mockRestore())

    runInNewTask(() => {
      scheduleSequentialTasks([
        () => {
          log('task 1')
        },
        () => {
          log('task 2')
        },
        () => {
          log('task 3')
        },
        () => {
          log('task 4')
          done.resolve()
        },
      ])
    })

    await done.promise

    // Sanity check that we successfully mocked setTimeout
    expect(setTimeoutWithoutIdleStart).toHaveBeenCalled()

    expect(logs).toEqual(['task 1', 'task 2', 'task 3', 'task 4'])

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Next.js cannot guarantee that Cache Components will run as expected'
      )
    )
  })
})

function deferSync(callback: () => void): Disposable {
  return {
    [Symbol.dispose]: async () => {
      return callback()
    },
  }
}
