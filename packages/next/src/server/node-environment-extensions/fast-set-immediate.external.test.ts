import { AsyncLocalStorage } from 'node:async_hooks'
import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'
import {
  DANGEROUSLY_runPendingImmediatesAfterCurrentTask,
  expectNoPendingImmediates,
} from './fast-set-immediate.external'
import { createAtomicTaskGroup } from '../app-render/app-render-scheduling'
import { scheduleTask } from '../app-render/sequential-tasks.external'

function createLogger() {
  const logs: string[] = []

  const log = (...args: any[]) => {
    const { inspect } = require('node:util') as typeof import('node:util')
    const { writeFileSync } = require('node:fs') as typeof import('node:fs')

    let logLine = args
      .map((arg) =>
        typeof arg === 'string' ? arg : inspect(arg, { colors: true })
      )
      .join(' ')

    logs.push(logLine)
    writeFileSync(process.stdout.fd, logLine + '\n')
  }
  return { logs, log }
}

it('runs immediates after each task', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()

  scheduleTask(() => {
    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

    log('task 1')
    setImmediate(() => {
      log('task 1 -> immediate 1')
      process.nextTick(() => {
        log('task 1 -> immediate 1 -> nextTick 1')
        queueMicrotask(() => {
          log('task 1 -> immediate 1 -> nextTick 1 -> microtask 1')
        })
        queueMicrotask(() => {
          process.nextTick(() => {
            log(
              'task 1 -> immediate 1 -> nextTick 1 -> microtask 2 -> nextTick'
            )
          })
        })
      })
    })
    setImmediate(() => {
      log('task 1 -> immediate 2')
    })
    process.nextTick(() => {
      log('task 1 -> nextTick 1')
      queueMicrotask(() => {
        log('task 1 -> nextTick 1 -> microtask 1')
      })
      queueMicrotask(() => {
        process.nextTick(() => {
          log('task 1 -> nextTick 1 -> microtask 2 -> nextTick')
        })
      })
      process.nextTick(() => {
        log('task 1 -> nextTick 1 -> nextTick 1')
      })
    })
  })

  scheduleTask(() => {
    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

    log('task 2')
    setImmediate(() => {
      log('task 2 -> immediate 1')
      setImmediate(() => {
        log('task 2 -> immediate 1 -> immediate 1')
      })
    })
  })

  scheduleTask(() => {
    log('task 3')
    try {
      expectNoPendingImmediates()
      done.resolve()
    } catch (err) {
      done.reject(err)
    }
  })

  await done.promise

  expect(logs).toEqual([
    // ===================================
    'task 1',
    'task 1 -> nextTick 1',
    'task 1 -> nextTick 1 -> nextTick 1',
    'task 1 -> nextTick 1 -> microtask 1',
    'task 1 -> nextTick 1 -> microtask 2 -> nextTick',
    // ======================
    'task 1 -> immediate 1',
    'task 1 -> immediate 1 -> nextTick 1',
    'task 1 -> immediate 1 -> nextTick 1 -> microtask 1',
    'task 1 -> immediate 1 -> nextTick 1 -> microtask 2 -> nextTick',
    // ======================
    'task 1 -> immediate 2',
    // ===================================
    'task 2',
    // ======================
    'task 2 -> immediate 1',
    // ======================
    'task 2 -> immediate 1 -> immediate 1',
    // ===================================
    'task 3',
  ])
})

it('only affects the task it is called in', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()

  // This test includes a native setImmediate, so we want to avoid
  // flakiness due to timer/immediate interleaving
  const scheduleTaskInGroup = createAtomicTaskGroup()

  scheduleTaskInGroup(() => {
    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

    log('task 1')
    setImmediate(() => {
      log('task 1 -> immediate 1 (fast)')
      setImmediate(() => {
        log('task 1 -> immediate 1 (fast) -> immediate 1 (fast)')
      })
    })
  })

  scheduleTaskInGroup(() => {
    log('task 2')
    try {
      expectNoPendingImmediates()
      // resolved elsewhere
    } catch (err) {
      done.reject(err)
    }

    // NOTE: native immediate
    setImmediate(() => {
      log('task 2 -> immediate 1 (native)')
      done.resolve()
    })
  })

  scheduleTaskInGroup(() => {
    log('task 3')
    try {
      expectNoPendingImmediates()
      // resolved elsewhere
    } catch (err) {
      done.reject(err)
    }
  })

  await done.promise

  expect(logs).toEqual([
    // ===================================
    'task 1',
    // ======================
    'task 1 -> immediate 1 (fast)',
    // ======================
    'task 1 -> immediate 1 (fast) -> immediate 1 (fast)',
    // ===================================
    'task 2',
    // ===================================
    'task 3',
    // ======================
    'task 2 -> immediate 1 (native)',
  ])
})

it('does not run immediates scheduled before it was called', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()

  // This test includes a native setImmediate, so we want to avoid
  // flakiness due to timer/immediate interleaving
  const scheduleTaskInGroup = createAtomicTaskGroup()

  scheduleTaskInGroup(() => {
    log('task 1')

    // NOTE: native immediate
    setImmediate(() => {
      log('task 1 -> immediate 1 (native)')
      done.resolve()
    })

    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

    setImmediate(() => {
      log('task 1 -> immediate 2 (fast)')
    })
  })

  scheduleTaskInGroup(() => {
    log('task 2')
    try {
      expectNoPendingImmediates()
      // resolved elsewhere
    } catch (err) {
      done.reject(err)
    }
  })

  await done.promise

  expect(logs).toEqual([
    // ===================================
    'task 1',
    // ======================
    'task 1 -> immediate 2 (fast)',
    // ===================================
    'task 2',
    // ======================
    'task 1 -> immediate 1 (native)',
  ])
})

it('runs immediates scheduled in nextTick', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()

  scheduleTask(() => {
    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

    log('task 1')
    process.nextTick(() => {
      setImmediate(() => {
        log('task 1 -> nextTick -> immediate 1')
        process.nextTick(() => {
          setImmediate(() => {
            log('task 1 -> nextTick -> immediate 1 -> nextTick -> immediate 1')
          })
        })
      })
    })
  })

  scheduleTask(() => {
    log('task 2')
    try {
      expectNoPendingImmediates()
      done.resolve()
    } catch (err) {
      done.reject(err)
    }
  })

  await done.promise

  expect(logs).toEqual([
    // ===================================
    'task 1',
    // ======================
    'task 1 -> nextTick -> immediate 1',
    // ======================
    'task 1 -> nextTick -> immediate 1 -> nextTick -> immediate 1',
    // ===================================
    'task 2',
  ])
})

it('runs ticks and microtasks from immediates before moving onto the next task', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()

  scheduleTask(() => {
    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

    log('task 1')
    setImmediate(() => {
      log('task 1 -> immediate 1')
      queueMicrotask(() => {
        log('task 1 -> immediate 1 -> microtask 1')
        queueMicrotask(() => {
          log('task 1 -> immediate 1 -> microtask 1 -> microtask 1')
        })
        process.nextTick(() => {
          log('task 1 -> immediate 1 -> microtask 1 -> nextTick')
        })
      })
      process.nextTick(() => {
        log('task 1 -> immediate 1 -> nextTick')
      })
    })
  })

  scheduleTask(() => {
    log('task 2')
    try {
      expectNoPendingImmediates()
      done.resolve()
    } catch (err) {
      done.reject(err)
    }
  })

  await done.promise

  expect(logs).toEqual([
    // ===================================
    'task 1',
    // ======================
    'task 1 -> immediate 1',
    'task 1 -> immediate 1 -> nextTick',
    'task 1 -> immediate 1 -> microtask 1',
    'task 1 -> immediate 1 -> microtask 1 -> microtask 1',
    'task 1 -> immediate 1 -> microtask 1 -> nextTick',
    // ===================================
    'task 2',
  ])
})

describe('alternate sources of immediates', () => {
  it('promisify(setImmediate)', async () => {
    // `setImmediate` defines a `util.promisify.custom`, and so does our patch.
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    const { promisify } = require('node:util') as typeof import('node:util')
    const promisifiedSetImmediate = promisify(setImmediate)

    scheduleTask(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('task 1')
      promisifiedSetImmediate().then(() => {
        log('task 1 -> immediate 1')
      })
    })

    scheduleTask(() => {
      log('task 2')
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'task 1',
      // ======================
      'task 1 -> immediate 1',
      // ======================
      'task 2',
    ])
  })

  it('require("node:timers").setImmediate', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    const timers = require('node:timers') as typeof import('node:timers')

    scheduleTask(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('task 1')
      timers.setImmediate(() => {
        log('task 1 -> immediate 1')
      })
    })

    scheduleTask(() => {
      log('task 2')
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'task 1',
      // ======================
      'task 1 -> immediate 1',
      // ======================
      'task 2',
    ])
  })

  it('require("node:timers/promises").setImmediate', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    const timersPromises =
      require('node:timers/promises') as typeof import('node:timers/promises')

    scheduleTask(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('task 1')
      timersPromises.setImmediate().then(() => {
        log('task 1 -> immediate 1')
      })
    })

    scheduleTask(() => {
      log('task 2')
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'task 1',
      // ======================
      'task 1 -> immediate 1',
      // ======================
      'task 2',
    ])
  })
})

describe('patched function behavior', () => {
  describe('setImmediate', () => {
    it('extra arguments are passed to callback', async () => {
      const done = createPromiseWithResolvers<void>()
      const passedArgs = [1, 2, 3]

      scheduleTask(() => {
        DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

        setImmediate(
          (...receivedArgs) => {
            try {
              expect(passedArgs).toEqual(receivedArgs)
              done.resolve()
            } catch (err) {
              done.reject(err)
            }
          },
          ...passedArgs
        )
      })

      await done.promise
    })

    it('validates the first argument', async () => {
      const done = createPromiseWithResolvers<void>()

      scheduleTask(() => {
        DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

        try {
          expect(() => setImmediate(undefined as any)).toThrow(
            /The "callback" argument must be of type function. Received undefined/
          )
          expect(() => setImmediate('not a callback' as any)).toThrow(
            /The "callback" argument must be of type function. Received type string/
          )
          done.resolve()
        } catch (err) {
          done.reject(err)
        }
      })

      await done.promise
    })
  })

  describe('process.nextTick', () => {
    it('extra arguments are passed to callback', async () => {
      const done = createPromiseWithResolvers<void>()
      const passedArgs = [1, 2, 3]

      scheduleTask(() => {
        DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

        process.nextTick(
          (...receivedArgs: unknown[]) => {
            try {
              expect(passedArgs).toEqual(receivedArgs)
              done.resolve()
            } catch (err) {
              done.reject(err)
            }
          },
          ...passedArgs
        )
      })

      await done.promise
    })

    it('validates the first argument', async () => {
      const done = createPromiseWithResolvers<void>()

      scheduleTask(() => {
        DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

        try {
          expect(() => process.nextTick(undefined as any)).toThrow(
            /The "callback" argument must be of type function. Received undefined/
          )
          expect(() => process.nextTick('not a callback' as any)).toThrow(
            /The "callback" argument must be of type function. Received type string/
          )
          done.resolve()
        } catch (err) {
          done.reject(err)
        }
      })

      await done.promise
    })
  })
})

describe('async context propagation', () => {
  it('propagates AsyncLocalStorage to setImmediate', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()
    const Ctx = new AsyncLocalStorage<string>()

    Ctx.run('outer', () => {
      scheduleTask(() => {
        DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
        log(`task 1 :: ${Ctx.getStore()}`)
        setImmediate(() => {
          // The outer context should be readable here
          log(`task 1 -> immediate 1 :: ${Ctx.getStore()}`)
          // Shadow the outer context
          Ctx.run('inner', () => {
            setImmediate(() => {
              // The inner context should be readable here
              log(`task 1 -> immediate 1 -> immediate 1 :: ${Ctx.getStore()}`)
            })
          })
        })
      })
    })

    scheduleTask(() => {
      // The context should not be readable here
      log(`task 2 :: ${Ctx.getStore()}`)
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'task 1 :: outer',
      // ======================
      'task 1 -> immediate 1 :: outer',
      // ======================
      'task 1 -> immediate 1 -> immediate 1 :: inner',
      // ===================================
      'task 2 :: undefined',
    ])
  })

  it('does not break AsyncLocalStorage propagation in process.nextTick', async () => {
    // We don't alter the implementation of `process.nextTick` much,
    // but we do patch it, so as a sanity check it's worth verifying that
    // we're not breaking async context propagation.

    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()
    const Ctx = new AsyncLocalStorage<string>()

    Ctx.run('hello', () => {
      scheduleTask(() => {
        DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

        log(`task 1 :: ${Ctx.getStore()}`)
        process.nextTick(() => {
          // the context should be readable here
          log(`task 1 -> nextTick :: ${Ctx.getStore()}`)
        })
      })
    })

    scheduleTask(() => {
      // The context should not be readable here
      log(`task 2 :: ${Ctx.getStore()}`)
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'task 1 :: hello',
      // ======================
      'task 1 -> nextTick :: hello',
      // ===================================
      'task 2 :: undefined',
    ])
  })
})

describe('allows cancelling immediates', () => {
  it('synchronously', async () => {
    const { log, logs } = createLogger()

    const done = createPromiseWithResolvers<void>()

    scheduleTask(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('task 1')
      setImmediate(() => {
        log('task 1 -> immediate 1')
      })
      const immediate2 = setImmediate(() => {
        log('task 1 -> immediate 2')
      })
      clearImmediate(immediate2)
    })

    scheduleTask(() => {
      log('task 2')
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'task 1',
      // ======================
      'task 1 -> immediate 1',
      // ===================================
      'task 2',
    ])
  })

  it('from a nextTick', async () => {
    const { log, logs } = createLogger()

    const done = createPromiseWithResolvers<void>()

    scheduleTask(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('task 1')
      setImmediate(() => {
        log('task 1 -> immediate 1')
      })
      const immediate2 = setImmediate(() => {
        log('task 1 -> immediate 2')
      })
      process.nextTick(() => {
        clearImmediate(immediate2)
      })
    })
    scheduleTask(() => {
      log('task 2')
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'task 1',
      // ======================
      'task 1 -> immediate 1',
      // ===================================
      'task 2',
    ])
  })

  it('from another immediate', async () => {
    const { log, logs } = createLogger()

    const done = createPromiseWithResolvers<void>()

    scheduleTask(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('task 1')
      setImmediate(() => {
        log('task 1 -> immediate 1')
        clearImmediate(immediate2)
      })
      const immediate2 = setImmediate(() => {
        log('task 1 -> immediate 2')
      })
    })
    scheduleTask(() => {
      log('task 2')
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'task 1',
      // ======================
      'task 1 -> immediate 1',
      // ===================================
      'task 2',
    ])
  })

  it('promisified - with an AbortSignal after creating', async () => {
    const { log, logs } = createLogger()

    const done = createPromiseWithResolvers<void>()

    const { promisify } = require('node:util') as typeof import('node:util')
    const promisifiedSetImmediate = promisify(setImmediate)

    const abortError = new Error('Stop right there')
    let thrownOnAbort: unknown

    scheduleTask(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('task 1')
      setImmediate(() => {
        log('task 1 -> immediate 1')
      })

      const abortController = new AbortController()

      promisifiedSetImmediate(undefined, {
        signal: abortController.signal,
      }).then(
        () => {
          log('task 1 -> immediate 2')
        },
        (err) => {
          thrownOnAbort = err
        }
      )

      abortController.abort(abortError)
    })
    scheduleTask(() => {
      log('task 2')
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'task 1',
      // ======================
      'task 1 -> immediate 1',
      // ===================================
      'task 2',
    ])
    expect(thrownOnAbort).toBe(abortError)
  })

  it('promisified - with an AbortSignal that was already aborted', async () => {
    const { log, logs } = createLogger()

    const done = createPromiseWithResolvers<void>()

    const { promisify } = require('node:util') as typeof import('node:util')
    const promisifiedSetImmediate = promisify(setImmediate)

    const abortError = new Error('Stop right there')
    let thrownOnAbort: unknown

    scheduleTask(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('task 1')
      setImmediate(() => {
        log('task 1 -> immediate 1')
      })

      const abortController = new AbortController()
      abortController.abort(abortError)

      promisifiedSetImmediate(undefined, {
        signal: abortController.signal,
      }).then(
        () => {
          log('task 1 -> immediate 2')
        },
        (err) => {
          thrownOnAbort = err
        }
      )
    })
    scheduleTask(() => {
      log('task 2')
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'task 1',
      // ======================
      'task 1 -> immediate 1',
      // ===================================
      'task 2',
    ])
    expect(thrownOnAbort).toBe(abortError)
  })
})

describe('uncaught errors in setImmediate do not affect surrounding tasks or other immediates', () => {
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

  it('sync errors trigger uncaughtException', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    const Ctx = new AsyncLocalStorage<string>()
    const contextValue = 'hello'

    let triggeredError: TriggeredUncaught | undefined = undefined
    using _ = trackUncaughtErrors((error, kind) => {
      log(`${kind} - ${Ctx.getStore()}`)
      triggeredError = { error, kind }
    })

    const error = new Error('kaboom')

    Ctx.run(contextValue, () => {
      scheduleTask(() => {
        DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
        log('task 1')

        setImmediate(() => {
          log('task 1 -> immediate 1')

          // In the patch, we rethrow the synchronous error asynchronously,
          // so unfortunately ticks will run before uncaughtException.
          process.nextTick(() => {
            log('task 1 -> immediate 1 -> nextTick')
          })

          throw error
        })

        setImmediate(() => {
          log('task 1 -> immediate 2')
        })
      })
    })

    scheduleTask(() => {
      log('task 2')
      // This ensures that we don't fall into this task in an invalid state.
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(triggeredError).toEqual({ error, kind: 'uncaughtException' })

    expect(logs).toEqual([
      // ===================================
      'task 1',
      // ======================
      'task 1 -> immediate 1',
      'task 1 -> immediate 1 -> nextTick', // undesirable (too early) but acceptable

      // FIXME: no async context in uncaughtException
      // `uncaughtException - ${contextValue}`,
      `uncaughtException - undefined`,

      // ======================
      'task 1 -> immediate 2',
      // ===================================
      'task 2',
    ])
  })

  it('sync errors in nextTick trigger uncaughtException', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    const Ctx = new AsyncLocalStorage<string>()
    const contextValue = 'hello'

    let triggeredError: TriggeredUncaught | undefined = undefined
    using _ = trackUncaughtErrors((error, kind) => {
      // Ideally, we can read the async context in an uncaughtException handler
      log(`${kind} - ${Ctx.getStore()}`)
      triggeredError = { error, kind }
    })

    const error = new Error('kaboom')

    Ctx.run(contextValue, () => {
      scheduleTask(() => {
        DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
        log('task 1')
        setImmediate(() => {
          log('task 1 -> immediate 1')
          process.nextTick(() => {
            log(`task 1 -> immediate 1 -> nextTick - ${Ctx.getStore()}`)
            throw error
          })
        })
        setImmediate(() => {
          log('task 1 -> immediate 2')
        })
      })
    })

    scheduleTask(() => {
      log('task 2')
      // This ensures that we don't fall into this task in an invalid state.
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(triggeredError).toEqual({ error, kind: 'uncaughtException' })

    expect(logs).toEqual([
      // ===================================
      'task 1',
      // ======================
      'task 1 -> immediate 1',
      `task 1 -> immediate 1 -> nextTick - ${contextValue}`,

      // FIXME: no async context in uncaughtException
      // `uncaughtException - ${contextValue}`,
      `uncaughtException - undefined`,

      // ======================
      'task 1 -> immediate 2',
      // ===================================
      'task 2',
    ])
  })

  it('sync errors in nextTick before immediate', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    let triggeredError: TriggeredUncaught | undefined = undefined
    using _ = trackUncaughtErrors((error, kind) => {
      log(kind)
      triggeredError = { error, kind }
    })

    const error = new Error('kaboom')

    scheduleTask(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
      log('task 1')
      process.nextTick(() => {
        log('task 1 -> nextTick')
        throw error
      })
      setImmediate(() => {
        log('task 1 -> immediate 1')
      })
      setImmediate(() => {
        log('task 1 -> immediate 2')
      })
    })

    scheduleTask(() => {
      log('task 2')
      // This ensures that we don't fall into this task in an invalid state.
      try {
        expectNoPendingImmediates()
        done.resolve()
      } catch (err) {
        done.reject(err)
      }
    })

    await done.promise

    expect(triggeredError).toEqual({ error, kind: 'uncaughtException' })

    expect(logs).toEqual([
      // ===================================
      'task 1',
      'task 1 -> nextTick',
      'uncaughtException',
      // ======================
      'task 1 -> immediate 1',
      // ======================
      'task 1 -> immediate 2',
      // ===================================
      'task 2',
    ])
  })

  describe('unhandled rejections', () => {
    type Case = {
      name: string
      immediate: (
        name: string,
        error: Error,
        log: (...args: any[]) => void
      ) => void
    }

    const unhandledRejectionCases: Case[] = [
      {
        name: 'Promise.resolve().then(...)',
        immediate: (name, error, log) => {
          log(name)
          void Promise.resolve().then(() => {
            log(`${name} :: erroring`)
            throw error
          })
        },
      },
      {
        name: 'throw in unawaited async IIFE',
        immediate: (name, error, log) => {
          log(name)
          void (async () => {
            await Promise.resolve()
            log(`${name} :: erroring`)
            throw error
          })()
        },
      },
      {
        name: 'Promise.reject(...)',
        immediate: (name, error, log) => {
          log(name)
          log(`${name} :: erroring`)
          Promise.reject(error)
        },
      },
      {
        name: 'throw in async immediate',
        immediate: async (name, error, log) => {
          log(name)
          await Promise.resolve()
          log(`${name} :: erroring`)
          throw error
        },
      },
    ]

    it.each(unhandledRejectionCases)('$name', async ({ immediate }) => {
      const { log, logs } = createLogger()
      const done = createPromiseWithResolvers<void>()

      const Ctx = new AsyncLocalStorage<string>()
      const contextValue = 'hello'

      let triggeredError: TriggeredUncaught | undefined = undefined
      using _ = trackUncaughtErrors((error, kind) => {
        // async context should be preserved
        log(`${kind} - ${Ctx.getStore()}`)
        triggeredError = { error, kind }
      })

      const error = new Error('kaboom')

      Ctx.run(contextValue, () => {
        scheduleTask(() => {
          DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
          log('task 1')
          setImmediate(() => {
            return immediate('task 1 -> immediate 1', error, log)
          })
          setImmediate(() => {
            log('task 1 -> immediate 2')
          })
        })
      })

      scheduleTask(() => {
        log('task 2')
        // This ensures that we don't fall into this task in an invalid state.
        try {
          expectNoPendingImmediates()
          done.resolve()
        } catch (err) {
          done.reject(err)
        }
      })

      await done.promise

      expect(triggeredError).toEqual({ error, kind: 'unhandledRejection' })

      expect(logs).toEqual([
        // ===================================
        'task 1',
        // ======================
        'task 1 -> immediate 1',
        'task 1 -> immediate 1 :: erroring',

        // FIXME: we would like to observe the rejection here...
        // `unhandledRejection - ${contextValue}`,

        // ======================
        'task 1 -> immediate 2',

        // FIXME: ...but it happens here, after the second immediate:
        `unhandledRejection - ${contextValue}`,
        // This is because unhandled rejections are only processed after the nextTick queue is empty:
        // https://github.com/nodejs/node/blob/d546e7fd0bc3cbb4bcc2baae6f3aa44d2e81a413/lib/internal/process/task_queues.js#L104-L105
        // and in our implementation, the second immediate is actually a nextTick.

        // ===================================
        'task 2',
      ])
    })
  })
})

describe('error recovery', () => {
  describe('when crashing, it bails out to native setImmediate and does not break subsequent calls', () => {
    const expectCorrectRunToWork = async () => {
      const { log, logs } = createLogger()
      const done = createPromiseWithResolvers<void>()

      scheduleTask(() => {
        try {
          DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
        } catch (err) {
          return done.reject(err)
        }

        log('task 1')

        setImmediate(() => {
          log('task 1 -> immediate 1')
        })
        setImmediate(() => {
          log('task 1 -> immediate 2')
        })
      })

      scheduleTask(() => {
        log('task 2')

        try {
          expectNoPendingImmediates()
          done.resolve()
        } catch (err) {
          done.reject(err)
        }
      })

      await done.promise

      expect(logs).toEqual([
        'task 1',
        'task 1 -> immediate 1',
        'task 1 -> immediate 2',
        'task 2',
      ])
    }

    const schedulingCases = [
      {
        description: 'in sync code',
        scheduleCrash: (cb: () => void) => {
          cb()
        },
      },
      {
        description: 'in nextTick',
        scheduleCrash: (cb: () => void) => {
          process.nextTick(() => {
            cb()
          })
        },
      },
      {
        description: 'in microtask',
        scheduleCrash: (cb: () => void) => {
          queueMicrotask(() => {
            cb()
          })
        },
      },
      {
        description: 'after microtasks',
        scheduleCrash: (cb: () => void) => {
          queueMicrotask(() => {
            process.nextTick(() => {
              cb()
            })
          })
        },
      },
    ]

    describe.each([
      {
        description: 'starting capture twice in the same task',
        invalidCall: () => {
          DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
        },
      },
      {
        description: 'expectNoPendingImmediates in the same task as capture',
        invalidCall: () => {
          expectNoPendingImmediates()
        },
      },
    ])('crash reason - $description', ({ invalidCall }) => {
      it.each(schedulingCases)(
        'after a crash - $description',
        async ({ scheduleCrash }) => {
          // In the first run, we trigger a crash

          const { log, logs } = createLogger()
          const dones = [
            createPromiseWithResolvers<void>(),
            createPromiseWithResolvers<void>(),
            createPromiseWithResolvers<void>(),
          ]

          // This test includes a native setImmediate, so we want to avoid
          // flakiness due to timer/immediate interleaving
          const scheduleTaskInGroup = createAtomicTaskGroup()

          scheduleTaskInGroup(() => {
            // NOTE: native immediate
            setImmediate(() => {
              log('immediate 1 (native)')
              dones[0].resolve()
            })
          })
          scheduleTaskInGroup(() => {
            DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
            log('task 1')

            setImmediate(() => {
              log('task 1 -> immediate 1 (patched)')
              dones[1].resolve()
            })

            setImmediate(() => {
              log('task 1 -> immediate 2 (patched)')
              dones[2].resolve()
            })

            scheduleCrash(() => {
              expect(() => invalidCall()).toThrow()
            })
          })

          await Promise.all(dones.map((d) => d.promise))

          expect(logs).toEqual([
            'task 1',
            // The queued immediates should be rescheduled using native `setImmediate`,
            // so we should observe them happening after the native one we scheduled earlier
            'immediate 1 (native)',
            'task 1 -> immediate 1 (patched)',
            'task 1 -> immediate 2 (patched)',
          ])

          // The next run should work correctly
          await expectCorrectRunToWork()
        }
      )

      it.each(schedulingCases)(
        'after a crash in a patched immediate - $description',
        async ({ scheduleCrash }) => {
          // In the first run, we trigger a crash

          const { log, logs } = createLogger()
          const dones = [
            createPromiseWithResolvers<void>(),
            createPromiseWithResolvers<void>(),
            createPromiseWithResolvers<void>(),
          ]

          // This test includes a native setImmediate, so we want to avoid
          // flakiness due to timer/immediate interleaving
          const scheduleTaskInGroup = createAtomicTaskGroup()

          scheduleTaskInGroup(() => {
            // NOTE: native immediate
            setImmediate(() => {
              log('immediate 1 (native)')
              dones[0].resolve()
            })
          })
          scheduleTaskInGroup(() => {
            DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
            log('task 1')

            setImmediate(() => {
              log('task 1 -> immediate 1 (patched)')
              dones[1].resolve()
            })

            setImmediate(() => {
              log('task 1 -> immediate 2 (patched)')
              scheduleCrash(() => {
                expect(() => expectNoPendingImmediates()).toThrow()
              })
            })

            setImmediate(() => {
              log('task 1 -> immediate 3 (patched)')
              dones[2].resolve()
            })
          })

          await Promise.all(dones.map((d) => d.promise))

          expect(logs).toEqual([
            'task 1',
            'task 1 -> immediate 1 (patched)',
            'task 1 -> immediate 2 (patched)',
            // The remaining queued immediate should be rescheduled using native `setImmediate`,
            // so we should observe it happening after the native one we scheduled earlier
            'immediate 1 (native)',
            'task 1 -> immediate 3 (patched)',
          ])

          // The next run should work correctly
          await expectCorrectRunToWork()
        }
      )
    })
  })
})
