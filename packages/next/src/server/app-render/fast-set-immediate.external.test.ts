import { AsyncLocalStorage } from 'node:async_hooks'
import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'
import {
  install,
  runPendingImmediatesAfterCurrentTask,
} from './fast-set-immediate.external'

install()

function createLogger() {
  const logs: string[] = []

  const log = (...args: any[]) => {
    const { inspect } = require('node:util') as typeof import('node:util')

    let logLine = args
      .map((arg) =>
        typeof arg === 'string' ? arg : inspect(arg, { colors: true })
      )
      .join(' ')

    logs.push(logLine)
    process.stdout.write(logLine + '\n')
  }
  return { logs, log }
}

it('runs immediates after each task', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()

  setTimeout(() => {
    runPendingImmediatesAfterCurrentTask()

    log('timeout 1')
    setImmediate(() => {
      log('timeout 1 -> immediate 1')
      process.nextTick(() => {
        log('timeout 1 -> immediate 1 -> nextTick 1')
        queueMicrotask(() => {
          log('timeout 1 -> immediate 1 -> nextTick 1 -> microtask 1')
        })
        queueMicrotask(() => {
          process.nextTick(() => {
            log(
              'timeout 1 -> immediate 1 -> nextTick 1 -> microtask 2 -> nextTick'
            )
          })
        })
      })
    })
    setImmediate(() => {
      log('timeout 1 -> immediate 2')
    })
    process.nextTick(() => {
      log('timeout 1 -> nextTick 1')
      queueMicrotask(() => {
        log('timeout 1 -> nextTick 1 -> microtask 1')
      })
      queueMicrotask(() => {
        process.nextTick(() => {
          log('timeout 1 -> nextTick 1 -> microtask 2 -> nextTick')
        })
      })
      process.nextTick(() => {
        log('timeout 1 -> nextTick 1 -> nextTick 1')
      })
    })
  })
  setTimeout(() => {
    runPendingImmediatesAfterCurrentTask()

    log('timeout 2')
    setImmediate(() => {
      log('timeout 2 -> immediate 1')
      setImmediate(() => {
        log('timeout 2 -> immediate 1 -> immediate 1')
      })
    })
  })
  setTimeout(() => {
    log('timeout 3')
    done.resolve()
  })

  await done.promise

  expect(logs).toEqual([
    // ===================================
    'timeout 1',
    'timeout 1 -> nextTick 1',
    'timeout 1 -> nextTick 1 -> nextTick 1',
    'timeout 1 -> nextTick 1 -> microtask 1',
    'timeout 1 -> nextTick 1 -> microtask 2 -> nextTick',
    // ======================
    'timeout 1 -> immediate 1',
    'timeout 1 -> immediate 1 -> nextTick 1',
    'timeout 1 -> immediate 1 -> nextTick 1 -> microtask 1',
    'timeout 1 -> immediate 1 -> nextTick 1 -> microtask 2 -> nextTick',
    // ======================
    'timeout 1 -> immediate 2',
    // ===================================
    'timeout 2',
    // ======================
    'timeout 2 -> immediate 1',
    // ======================
    'timeout 2 -> immediate 1 -> immediate 1',
    // ===================================
    'timeout 3',
  ])
})

it('only affects the task it is called in', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()

  setTimeout(() => {
    runPendingImmediatesAfterCurrentTask()

    log('timeout 1')
    setImmediate(() => {
      log('timeout 1 -> immediate 1 (fast)')
      setImmediate(() => {
        log('timeout 1 -> immediate 1 (fast) -> immediate 1 (fast)')
      })
    })
  })
  setTimeout(() => {
    log('timeout 2')
    setImmediate(() => {
      log('timeout 2 -> immediate 1 (slow)')
      done.resolve()
    })
  })
  setTimeout(() => {
    log('timeout 3')
  })

  await done.promise

  expect(logs).toEqual([
    // ===================================
    'timeout 1',
    // ======================
    'timeout 1 -> immediate 1 (fast)',
    // ======================
    'timeout 1 -> immediate 1 (fast) -> immediate 1 (fast)',
    // ===================================
    'timeout 2',
    // ===================================
    'timeout 3',
    // ======================
    'timeout 2 -> immediate 1 (slow)',
  ])
})

it('propagates AsyncLocalStorage', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()
  const Ctx = new AsyncLocalStorage<string>()

  setTimeout(() => {
    runPendingImmediatesAfterCurrentTask()
    Ctx.run('hello', () => {
      log(`timeout 1 :: ${Ctx.getStore()}`)
      setImmediate(() => {
        log(`timeout 1 -> immediate 1 :: ${Ctx.getStore()}`)
        setImmediate(() => {
          log(`timeout 1 -> immediate 1 -> immediate 1 :: ${Ctx.getStore()}`)
        })
      })
    })
  })
  setTimeout(() => {
    log('timeout 2')
    done.resolve()
  })

  await done.promise

  expect(logs).toEqual([
    // ===================================
    'timeout 1 :: hello',
    // ======================
    'timeout 1 -> immediate 1 :: hello',
    // ======================
    'timeout 1 -> immediate 1 -> immediate 1 :: hello',
    // ===================================
    'timeout 2',
  ])
})

describe('allows cancelling immediates', () => {
  it('synchronously', async () => {
    const { log, logs } = createLogger()

    const done = createPromiseWithResolvers<void>()

    setTimeout(() => {
      runPendingImmediatesAfterCurrentTask()

      log('timeout 1')
      setImmediate(() => {
        log('timeout 1 -> immediate 1')
      })
      const immediate2 = setImmediate(() => {
        log('timeout 1 -> immediate 2')
      })
      clearImmediate(immediate2)
    })
    setTimeout(() => {
      log('timeout 2')
      done.resolve()
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ===================================
      'timeout 2',
    ])
  })

  it('from a nextTick', async () => {
    const { log, logs } = createLogger()

    const done = createPromiseWithResolvers<void>()

    setTimeout(() => {
      runPendingImmediatesAfterCurrentTask()

      log('timeout 1')
      setImmediate(() => {
        log('timeout 1 -> immediate 1')
      })
      const immediate2 = setImmediate(() => {
        log('timeout 1 -> immediate 2')
      })
      process.nextTick(() => {
        clearImmediate(immediate2)
      })
    })
    setTimeout(() => {
      log('timeout 2')
      done.resolve()
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ===================================
      'timeout 2',
    ])
  })

  it('from another immediate', async () => {
    const { log, logs } = createLogger()

    const done = createPromiseWithResolvers<void>()

    setTimeout(() => {
      runPendingImmediatesAfterCurrentTask()

      log('timeout 1')
      setImmediate(() => {
        log('timeout 1 -> immediate 1')
        clearImmediate(immediate2)
      })
      const immediate2 = setImmediate(() => {
        log('timeout 1 -> immediate 2')
      })
    })
    setTimeout(() => {
      log('timeout 2')
      done.resolve()
    })

    await done.promise

    expect(logs).toEqual([
      // ===================================
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ===================================
      'timeout 2',
    ])
  })
})
