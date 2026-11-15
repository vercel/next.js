import '../node-environment-baseline'
import { AsyncLocalStorage, createHook } from 'node:async_hooks'
import { execFile } from 'node:child_process'
import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'
import {
  DANGEROUSLY_runPendingImmediatesAfterCurrentTask,
  expectNoPendingImmediates,
  ImmediateTracker,
  runWithNativeImmediateTracking,
  unpatchedSetImmediate,
} from './fast-set-immediate.external'
import { createAtomicTimerGroup } from '../app-render/app-render-scheduling'

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

  setTimeout(() => {
    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

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
    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

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

  // This test includes a native setImmediate, so we want to avoid
  // flakiness due to timer/immediate interleaving
  const scheduleTimeout = createAtomicTimerGroup()

  scheduleTimeout(() => {
    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

    log('timeout 1')
    setImmediate(() => {
      log('timeout 1 -> immediate 1 (fast)')
      setImmediate(() => {
        log('timeout 1 -> immediate 1 (fast) -> immediate 1 (fast)')
      })
    })
  })

  scheduleTimeout(() => {
    log('timeout 2')
    try {
      expectNoPendingImmediates()
      // resolved elsewhere
    } catch (err) {
      done.reject(err)
    }

    // NOTE: native immediate
    setImmediate(() => {
      log('timeout 2 -> immediate 1 (native)')
      done.resolve()
    })
  })

  scheduleTimeout(() => {
    log('timeout 3')
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
    'timeout 2 -> immediate 1 (native)',
  ])
})

it('does not run immediates scheduled before it was called', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()

  // This test includes a native setImmediate, so we want to avoid
  // flakiness due to timer/immediate interleaving
  const scheduleTimeout = createAtomicTimerGroup()

  scheduleTimeout(() => {
    log('timeout 1')

    // NOTE: native immediate
    setImmediate(() => {
      log('timeout 1 -> immediate 1 (native)')
      done.resolve()
    })

    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

    setImmediate(() => {
      log('timeout 1 -> immediate 2 (fast)')
    })
  })

  scheduleTimeout(() => {
    log('timeout 2')
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
    'timeout 1',
    // ======================
    'timeout 1 -> immediate 2 (fast)',
    // ===================================
    'timeout 2',
    // ======================
    'timeout 1 -> immediate 1 (native)',
  ])
})

it('runs immediates scheduled in nextTick', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()

  setTimeout(() => {
    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

    log('timeout 1')
    process.nextTick(() => {
      setImmediate(() => {
        log('timeout 1 -> nextTick -> immediate 1')
        process.nextTick(() => {
          setImmediate(() => {
            log(
              'timeout 1 -> nextTick -> immediate 1 -> nextTick -> immediate 1'
            )
          })
        })
      })
    })
  })

  setTimeout(() => {
    log('timeout 2')
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
    'timeout 1',
    // ======================
    'timeout 1 -> nextTick -> immediate 1',
    // ======================
    'timeout 1 -> nextTick -> immediate 1 -> nextTick -> immediate 1',
    // ===================================
    'timeout 2',
  ])
})

it('runs ticks and microtasks from immediates before moving onto the next task', async () => {
  const { log, logs } = createLogger()
  const done = createPromiseWithResolvers<void>()

  setTimeout(() => {
    DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

    log('timeout 1')
    setImmediate(() => {
      log('timeout 1 -> immediate 1')
      queueMicrotask(() => {
        log('timeout 1 -> immediate 1 -> microtask 1')
        queueMicrotask(() => {
          log('timeout 1 -> immediate 1 -> microtask 1 -> microtask 1')
        })
        process.nextTick(() => {
          log('timeout 1 -> immediate 1 -> microtask 1 -> nextTick')
        })
      })
      process.nextTick(() => {
        log('timeout 1 -> immediate 1 -> nextTick')
      })
    })
  })

  setTimeout(() => {
    log('timeout 2')
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
    'timeout 1',
    // ======================
    'timeout 1 -> immediate 1',
    'timeout 1 -> immediate 1 -> nextTick',
    'timeout 1 -> immediate 1 -> microtask 1',
    'timeout 1 -> immediate 1 -> microtask 1 -> microtask 1',
    'timeout 1 -> immediate 1 -> microtask 1 -> nextTick',
    // ===================================
    'timeout 2',
  ])
})

describe('native immediate tracking', () => {
  it('separates explicit trackers, forwards arguments and results, and restores the parent scope', async () => {
    const first = new ImmediateTracker()
    const second = new ImmediateTracker()
    const render = (value: string, count: number) => {
      setImmediate(() => {})
      return { value, count }
    }

    runWithNativeImmediateTracking(first, () => {
      expect(
        runWithNativeImmediateTracking(second, render, 'second', 2)
      ).toEqual({
        value: 'second',
        count: 2,
      })
      expect(first.hasPendingImmediates()).toBe(false)
      expect(second.hasPendingImmediates()).toBe(true)
      expect(render('first', 1)).toEqual({ value: 'first', count: 1 })
      expect(first.hasPendingImmediates()).toBe(true)
    })

    await Promise.all([
      new Promise<void>((resolve) => first.onIdle(resolve)),
      new Promise<void>((resolve) => second.onIdle(resolve)),
    ])

    const error = new Error('render failed')
    runWithNativeImmediateTracking(first, () => {
      expect(() =>
        runWithNativeImmediateTracking(second, () => {
          throw error
        })
      ).toThrow(error)
      setImmediate(() => {})
      expect(first.hasPendingImmediates()).toBe(true)
      expect(second.hasPendingImmediates()).toBe(false)
    })

    await new Promise<void>((resolve) => first.onIdle(resolve))
    setImmediate(() => {})
    expect(first.hasPendingImmediates()).toBe(false)
    expect(second.hasPendingImmediates()).toBe(false)
    await new Promise<void>((resolve) => unpatchedSetImmediate(resolve))
  })

  it('coalesces a synchronous burst of native immediates into at most two checks', async () => {
    const tracker = new ImmediateTracker()
    const storage = new AsyncLocalStorage<symbol>()
    const marker = Symbol('immediate burst')
    const count = 32
    const callback = jest.fn()
    let nativeImmediates = 0
    const hook = createHook({
      init(_asyncId, type) {
        if (type === 'Immediate' && storage.getStore() === marker) {
          nativeImmediates++
        }
      },
    })

    hook.enable()
    try {
      await storage.run(marker, () =>
        runWithNativeImmediateTracking(tracker, async () => {
          for (let index = 0; index < count; index++) {
            setImmediate(callback)
          }
          expect(nativeImmediates).toBe(count + 1)
          expect(callback).not.toHaveBeenCalled()
          await new Promise<void>((resolve) => tracker.onIdle(resolve))
        })
      )
      expect(callback).toHaveBeenCalledTimes(count)
      expect(nativeImmediates).toBeLessThanOrEqual(count + 2)
      expect(tracker.hasPendingImmediates()).toBe(false)
    } finally {
      hook.disable()
    }
  })

  it('waits for callback, microtask, and nextTick work queued after a successor check', async () => {
    for (const source of ['callback', 'microtask', 'nextTick']) {
      const tracker = new ImmediateTracker()
      const events: string[] = []
      const done = createPromiseWithResolvers<void>()

      runWithNativeImmediateTracking(tracker, () => {
        setImmediate(() => events.push('first'))
        // The first sentinel queues its successor before this callback runs.
        setImmediate(() => {
          events.push('second')
          const scheduleDescendant = () => {
            setImmediate(() => {
              events.push(source)
              setImmediate(() => {
                events.push('descendant')
                done.resolve()
              })
            })
          }
          if (source === 'callback') {
            scheduleDescendant()
          } else if (source === 'microtask') {
            queueMicrotask(scheduleDescendant)
          } else {
            process.nextTick(scheduleDescendant)
          }
        })
      })

      await Promise.all([
        done.promise,
        new Promise<void>((resolve) => {
          tracker.onIdle(() => {
            events.push('idle')
            resolve()
          })
        }),
      ])
      expect(events).toEqual(['first', 'second', source, 'descendant', 'idle'])
      expect(tracker.hasPendingImmediates()).toBe(false)
    }
  })

  it('tracks native descendants before a readiness subscription', async () => {
    const events: string[] = []
    const tracker = new ImmediateTracker()
    runWithNativeImmediateTracking(tracker, () => {
      setImmediate(() => {
        events.push('root')
        setImmediate(() => events.push('callback'))
        process.nextTick(() => {
          setImmediate(() => events.push('nextTick'))
        })
        queueMicrotask(() => {
          setImmediate(() => {
            events.push('microtask')
            queueMicrotask(() => {
              process.nextTick(() => {
                setImmediate(() => events.push('nested nextTick'))
              })
            })
          })
        })
      })
    })

    await new Promise<void>((resolve) => unpatchedSetImmediate(resolve))
    expect(events).toEqual(['root'])
    expect(tracker.hasPendingImmediates()).toBe(true)

    await new Promise<void>((resolve) => tracker.onIdle(resolve))
    expect(events).toEqual([
      'root',
      'callback',
      'nextTick',
      'microtask',
      'nested nextTick',
    ])
    expect(tracker.hasPendingImmediates()).toBe(false)
  })

  it('waits for a native sentinel on every subscription and tracks later batches', async () => {
    const tracker = new ImmediateTracker()
    await runWithNativeImmediateTracking(tracker, async () => {
      const events: string[] = []
      let previousReady: Promise<void> | undefined

      for (const batch of ['first', 'second']) {
        unpatchedSetImmediate(() => events.push(`${batch} control`))
        const ready = new Promise<void>((resolve) => tracker.onIdle(resolve))
        const otherReady = new Promise<void>((resolve) =>
          tracker.onIdle(resolve)
        )
        expect(ready).not.toBe(previousReady)
        expect(ready).not.toBe(otherReady)
        let settled = false
        ready.then(() => {
          settled = true
        })
        await Promise.resolve()
        expect(settled).toBe(false)

        await Promise.all([ready, otherReady])
        expect(events.at(-1)).toBe(`${batch} control`)
        setImmediate(() => {
          setImmediate(() => events.push(batch))
        })
        expect(tracker.hasPendingImmediates()).toBe(true)
        await new Promise<void>((resolve) => tracker.onIdle(resolve))
        expect(events.at(-1)).toBe(batch)
        expect(tracker.hasPendingImmediates()).toBe(false)
        previousReady = ready
      }
    })
  })

  it('cancels idle subscriptions independently and accepts later subscriptions', async () => {
    const tracker = new ImmediateTracker()
    await runWithNativeImmediateTracking(tracker, async () => {
      const cancelled = jest.fn()
      const active = jest.fn()
      const cancel = tracker.onIdle(cancelled)
      tracker.onIdle(active)
      cancel()
      cancel()

      await new Promise<void>((resolve) => tracker.onIdle(resolve))
      expect(cancelled).not.toHaveBeenCalled()
      expect(active).toHaveBeenCalledTimes(1)

      tracker.onIdle(cancelled)
      await new Promise<void>((resolve) => tracker.onIdle(resolve))
      expect(cancelled).toHaveBeenCalledTimes(1)
      expect(active).toHaveBeenCalledTimes(1)
    })
  })

  it('preserves subscriber context across cancellation, resubscription, and listener reentry', async () => {
    const tracker = new ImmediateTracker()
    const subscriberTracker = new ImmediateTracker()
    const storage = new AsyncLocalStorage<string>()
    const events: string[] = []
    const cancelled = jest.fn()
    const cancel = tracker.onIdle(cancelled)
    cancel()
    const notified = createPromiseWithResolvers<void>()
    const reentered = createPromiseWithResolvers<void>()

    storage.run('work', () =>
      runWithNativeImmediateTracking(tracker, () => {
        setImmediate(() => events.push(`work: ${storage.getStore()}`))
      })
    )
    storage.run('subscriber', () =>
      runWithNativeImmediateTracking(subscriberTracker, () => {
        tracker.onIdle(() => {
          events.push(`idle: ${storage.getStore()}`)
          setImmediate(() =>
            events.push(`listener work: ${storage.getStore()}`)
          )
          tracker.onIdle(() => {
            events.push(`reentered: ${storage.getStore()}`)
            reentered.resolve()
          })
          cancel()
          notified.resolve()
        })
      })
    )

    await notified.promise
    expect(subscriberTracker.hasPendingImmediates()).toBe(true)
    await reentered.promise
    expect(cancelled).not.toHaveBeenCalled()
    expect(events).toEqual([
      'work: work',
      'idle: subscriber',
      'listener work: subscriber',
      'reentered: subscriber',
    ])
    expect(tracker.hasPendingImmediates()).toBe(false)
    expect(subscriberTracker.hasPendingImmediates()).toBe(false)
    expect(storage.getStore()).toBeUndefined()
  })

  it('exits after cancelling an idle subscription with recurring unreferenced immediates', async () => {
    const { promisify } = require('node:util') as typeof import('node:util')
    const subprocess = promisify(execFile)(
      process.execPath,
      [
        '--require',
        require.resolve('tsx/cjs'),
        '--eval',
        `
          require(${JSON.stringify(require.resolve('../node-environment-baseline'))})
          const { ImmediateTracker, runWithNativeImmediateTracking } =
            require(${JSON.stringify(require.resolve('./fast-set-immediate.external'))})
          const assert = require('node:assert/strict')
          const tracker = new ImmediateTracker()
          let callbacks = 0
          process.on('exit', () => {
            assert.ok(callbacks >= 5, 'The subscription must keep the process alive until cancellation')
          })

          runWithNativeImmediateTracking(tracker, () => {
            const repeat = () => {
              callbacks++
              if (callbacks === 5) {
                cancel()
                cancel()
                console.log('cancelled')
              }
              setImmediate(repeat).unref()
            }
            setImmediate(repeat).unref()
            const cancel = tracker.onIdle(() => {
              throw new Error('Recurring immediates must not report idle')
            })
          })
        `,
      ],
      { timeout: 10_000, killSignal: 'SIGKILL' }
    )
    try {
      const { stdout, stderr } = await subprocess
      expect(stderr).toBe('')
      expect(stdout.trim()).toBe('cancelled')
    } finally {
      subprocess.child.kill('SIGKILL')
    }
  })

  it('keeps native scheduling unless fast scheduling is explicitly enabled', async () => {
    const events: string[] = []
    const done = createPromiseWithResolvers<void>()
    const scheduleTimeout = createAtomicTimerGroup()

    const tracker = new ImmediateTracker()
    runWithNativeImmediateTracking(tracker, () => {
      scheduleTimeout(() => {
        events.push('first timer')
        unpatchedSetImmediate(() => events.push('native control'))
        setImmediate(() => {
          events.push('native')
          setImmediate(() => events.push('native nested'))
        })

        DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
        setImmediate(() => {
          events.push('fast')
          setImmediate(() => events.push('fast nested'))
        })
        new Promise<void>((resolve) => tracker.onIdle(resolve)).then(
          done.resolve,
          done.reject
        )
      })
      scheduleTimeout(() => events.push('second timer'))
    })

    await done.promise
    expectNoPendingImmediates()
    expect(events).toEqual([
      'first timer',
      'fast',
      'fast nested',
      'second timer',
      'native control',
      'native',
      'native nested',
    ])
  })

  it('isolates renders that resume from the same promise', async () => {
    const first = new ImmediateTracker()
    const second = new ImmediateTracker()
    const shared = createPromiseWithResolvers<void>()
    const outside = shared.promise.then(() => {
      setImmediate(() => {})
      expect(first.hasPendingImmediates()).toBe(false)
      expect(second.hasPendingImmediates()).toBe(false)
    })
    const observed: string[] = []
    const render = (nested: boolean) => {
      const resumed = shared.promise.then(() => {
        setImmediate(() => {
          observed.push(nested ? 'second' : 'first')
          if (nested) {
            setImmediate(() => {
              setImmediate(() => observed.push('second descendant'))
            })
          }
        })
      })
      if (!nested) {
        unpatchedSetImmediate(shared.resolve)
      }
      return resumed
    }

    const firstResumed = runWithNativeImmediateTracking(first, render, false)
    const secondResumed = runWithNativeImmediateTracking(second, render, true)
    await Promise.all([firstResumed, secondResumed, outside])
    expect(first.hasPendingImmediates()).toBe(true)
    expect(second.hasPendingImmediates()).toBe(true)

    await new Promise<void>((resolve) => first.onIdle(resolve))
    expect(first.hasPendingImmediates()).toBe(false)
    expect(second.hasPendingImmediates()).toBe(true)
    await new Promise<void>((resolve) => second.onIdle(resolve))
    expect(observed).toEqual(['first', 'second', 'second descendant'])
    expect(second.hasPendingImmediates()).toBe(false)
  })

  it('preserves native callback arguments, handles, cancellation, and disposal', async () => {
    const tracker = new ImmediateTracker()
    await runWithNativeImmediateTracking(tracker, async () => {
      const timers = require('node:timers') as typeof import('node:timers')
      let receiver: NodeJS.Immediate | undefined
      const callback = jest.fn(function (
        this: NodeJS.Immediate,
        ..._args: unknown[]
      ) {
        receiver = this
      })
      const value = { message: 'native arguments' }
      const immediate = timers.setImmediate(callback, value, 42)
      const control = unpatchedSetImmediate(() => {})
      expect(Object.getPrototypeOf(immediate)).toBe(
        Object.getPrototypeOf(control)
      )
      clearImmediate(control)
      expect(immediate.hasRef()).toBe(true)
      expect(immediate.unref()).toBe(immediate)
      expect(immediate.hasRef()).toBe(false)
      expect(immediate.ref()).toBe(immediate)
      expect(immediate.hasRef()).toBe(true)

      const cancelled = jest.fn()
      const cleared = setImmediate(cancelled)
      process.nextTick(() => {
        timers.clearImmediate(cleared)
        timers.clearImmediate(cleared)
      })
      const disposed = setImmediate(cancelled)
      const { runInThisContext } =
        require('node:vm') as typeof import('node:vm')
      // Jest's Symbol.dispose polyfill is not the symbol on native handles.
      const nativeDispose: typeof Symbol.dispose =
        runInThisContext('Symbol.dispose')
      disposed[nativeDispose]()
      disposed[nativeDispose]()
      expect(() => setImmediate(undefined as any)).toThrow(/callback/)

      await new Promise<void>((resolve) => tracker.onIdle(resolve))
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(value, 42)
      expect(receiver).toBe(immediate)
      expect(cancelled).not.toHaveBeenCalled()
      expect(tracker.hasPendingImmediates()).toBe(false)
    })
  })

  it('preserves native promisified values and AbortError semantics', async () => {
    const { promisify } = require('node:util') as typeof import('node:util')
    const timersPromises =
      require('node:timers/promises') as typeof import('node:timers/promises')

    const tracker = new ImmediateTracker()
    await runWithNativeImmediateTracking(tracker, async () => {
      for (const immediate of [
        promisify(setImmediate),
        timersPromises.setImmediate,
      ]) {
        const value = { message: 'native value' }
        const values: unknown[] = []
        const fulfilled = immediate(value, { ref: false }).then((result) => {
          setImmediate(() => values.push(result))
        })
        await new Promise<void>((resolve) => tracker.onIdle(resolve))
        await fulfilled
        expect(values).toEqual([value])

        const controller = new AbortController()
        const reason = new Error('cancel native immediate')
        const cancelled = immediate(undefined, { signal: controller.signal })
        controller.abort(reason)
        await expect(cancelled).rejects.toMatchObject({
          name: 'AbortError',
          code: 'ABORT_ERR',
          cause: reason,
        })
        await expect(
          immediate(undefined, { signal: controller.signal })
        ).rejects.toMatchObject({
          name: 'AbortError',
          code: 'ABORT_ERR',
          cause: reason,
        })
        await new Promise<void>((resolve) => tracker.onIdle(resolve))
        expect(tracker.hasPendingImmediates()).toBe(false)
      }
    })
  })
})

describe('alternate sources of immediates', () => {
  it('promisify(setImmediate)', async () => {
    // `setImmediate` defines a `util.promisify.custom`, and so does our patch.
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    const { promisify } = require('node:util') as typeof import('node:util')
    const promisifiedSetImmediate = promisify(setImmediate)

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('timeout 1')
      promisifiedSetImmediate().then(() => {
        log('timeout 1 -> immediate 1')
      })
    })

    setTimeout(() => {
      log('timeout 2')
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
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ======================
      'timeout 2',
    ])
  })

  it('require("node:timers").setImmediate', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    const timers = require('node:timers') as typeof import('node:timers')

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('timeout 1')
      timers.setImmediate(() => {
        log('timeout 1 -> immediate 1')
      })
    })

    setTimeout(() => {
      log('timeout 2')
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
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ======================
      'timeout 2',
    ])
  })

  it('require("node:timers/promises").setImmediate', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()

    const timersPromises =
      require('node:timers/promises') as typeof import('node:timers/promises')

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('timeout 1')
      timersPromises.setImmediate().then(() => {
        log('timeout 1 -> immediate 1')
      })
    })

    setTimeout(() => {
      log('timeout 2')
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
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ======================
      'timeout 2',
    ])
  })
})

describe('patched function behavior', () => {
  describe('setImmediate', () => {
    it('extra arguments are passed to callback', async () => {
      const done = createPromiseWithResolvers<void>()
      const passedArgs = [1, 2, 3]

      setTimeout(() => {
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

      setTimeout(() => {
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

      setTimeout(() => {
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

      setTimeout(() => {
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
  it('shares capture across promise continuations without leaking it to the next task', async () => {
    const { log, logs } = createLogger()
    const context = new AsyncLocalStorage<string>()
    const shared = createPromiseWithResolvers<void>()
    const done = createPromiseWithResolvers<void>()
    const scheduleTimeout = createAtomicTimerGroup()

    for (const name of ['A', 'B']) {
      context
        .run(name, async () => {
          await shared.promise
          log(`${name} resumed :: ${context.getStore()}`)
          if (name === 'A') {
            DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
          }
          setImmediate(() => {
            log(`${name} immediate :: ${context.getStore()}`)
            if (name === 'A') {
              setImmediate(() =>
                log(`A nested immediate :: ${context.getStore()}`)
              )
            }
          })
        })
        .catch(done.reject)
    }

    scheduleTimeout(() => {
      try {
        expectNoPendingImmediates()
        log('first timer')
        shared.resolve()
      } catch (error) {
        done.reject(error)
      }
    })

    scheduleTimeout(() => {
      try {
        expectNoPendingImmediates()
        log(`next timer :: ${context.getStore()}`)
        context.run('B', () => {
          setImmediate(() => {
            log(`B native immediate :: ${context.getStore()}`)
            done.resolve()
          })
        })
      } catch (error) {
        done.reject(error)
      }
    })

    scheduleTimeout(() => {
      try {
        expectNoPendingImmediates()
        log('last timer')
      } catch (error) {
        done.reject(error)
      }
    })

    await done.promise

    expect(logs).toEqual([
      'first timer',
      'A resumed :: A',
      'B resumed :: B',
      'A immediate :: A',
      'B immediate :: B',
      'A nested immediate :: A',
      'next timer :: undefined',
      'last timer',
      'B native immediate :: B',
    ])
  })

  it('propagates AsyncLocalStorage to setImmediate', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()
    const Ctx = new AsyncLocalStorage<string>()

    Ctx.run('outer', () => {
      setTimeout(() => {
        DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
        log(`timeout 1 :: ${Ctx.getStore()}`)
        setImmediate(() => {
          // The outer context should be readable here
          log(`timeout 1 -> immediate 1 :: ${Ctx.getStore()}`)
          // Shadow the outer context
          Ctx.run('inner', () => {
            setImmediate(() => {
              // The inner context should be readable here
              log(
                `timeout 1 -> immediate 1 -> immediate 1 :: ${Ctx.getStore()}`
              )
            })
          })
        })
      })
    })

    setTimeout(() => {
      // The context should not be readable here
      log(`timeout 2 :: ${Ctx.getStore()}`)
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
      'timeout 1 :: outer',
      // ======================
      'timeout 1 -> immediate 1 :: outer',
      // ======================
      'timeout 1 -> immediate 1 -> immediate 1 :: inner',
      // ===================================
      'timeout 2 :: undefined',
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
      setTimeout(() => {
        DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

        log(`timeout 1 :: ${Ctx.getStore()}`)
        process.nextTick(() => {
          // the context should be readable here
          log(`timeout 1 -> nextTick :: ${Ctx.getStore()}`)
        })
      })
    })

    setTimeout(() => {
      // The context should not be readable here
      log(`timeout 2 :: ${Ctx.getStore()}`)
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
      'timeout 1 :: hello',
      // ======================
      'timeout 1 -> nextTick :: hello',
      // ===================================
      'timeout 2 :: undefined',
    ])
  })
})

describe('allows cancelling immediates', () => {
  it('synchronously', async () => {
    const { log, logs } = createLogger()

    const done = createPromiseWithResolvers<void>()

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

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
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

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
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

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
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ===================================
      'timeout 2',
    ])
  })

  it('promisified - with an AbortSignal after creating', async () => {
    const { log, logs } = createLogger()

    const done = createPromiseWithResolvers<void>()

    const { promisify } = require('node:util') as typeof import('node:util')
    const promisifiedSetImmediate = promisify(setImmediate)

    const abortError = new Error('Stop right there')
    let thrownOnAbort: unknown

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('timeout 1')
      setImmediate(() => {
        log('timeout 1 -> immediate 1')
      })

      const abortController = new AbortController()

      promisifiedSetImmediate(undefined, {
        signal: abortController.signal,
      }).then(
        () => {
          log('timeout 1 -> immediate 2')
        },
        (err) => {
          thrownOnAbort = err
        }
      )

      abortController.abort(abortError)
    })
    setTimeout(() => {
      log('timeout 2')
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
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ===================================
      'timeout 2',
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

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()

      log('timeout 1')
      setImmediate(() => {
        log('timeout 1 -> immediate 1')
      })

      const abortController = new AbortController()
      abortController.abort(abortError)

      promisifiedSetImmediate(undefined, {
        signal: abortController.signal,
      }).then(
        () => {
          log('timeout 1 -> immediate 2')
        },
        (err) => {
          thrownOnAbort = err
        }
      )
    })
    setTimeout(() => {
      log('timeout 2')
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
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      // ===================================
      'timeout 2',
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

  it('preserves native nextTick error timing without capture', async () => {
    const { log, logs } = createLogger()
    const done = createPromiseWithResolvers<void>()
    const scheduleTimeout = createAtomicTimerGroup()
    const error = new Error('native nextTick error')
    const triggeredErrors: TriggeredUncaught[] = []

    using _ = trackUncaughtErrors((receivedError, kind) => {
      log(kind)
      triggeredErrors.push({ error: receivedError, kind })
    })

    scheduleTimeout(() => {
      try {
        expectNoPendingImmediates()
        log('first timer')
        process.nextTick(() => {
          log('nextTick')
          throw error
        })
        process.nextTick(() => log('remaining nextTick'))
        setImmediate(() => {
          log('native immediate')
          done.resolve()
        })
      } catch (caughtError) {
        done.reject(caughtError)
      }
    })

    scheduleTimeout(() => {
      try {
        log('next timer')
        expectNoPendingImmediates()
      } catch (caughtError) {
        done.reject(caughtError)
      }
    })

    await done.promise

    expectNoPendingImmediates()
    expect(triggeredErrors[0]?.error).toBe(error)
    expect(triggeredErrors).toEqual([{ error, kind: 'uncaughtException' }])
    expect(logs).toEqual([
      'first timer',
      'nextTick',
      'uncaughtException',
      'next timer',
      'remaining nextTick',
      'native immediate',
    ])
  })

  it('recovers from native callback and nextTick errors while tracking', async () => {
    const { promisify } = require('node:util') as typeof import('node:util')
    for (const kind of ['immediate', 'nextTick']) {
      const subprocess = promisify(execFile)(
        process.execPath,
        [
          '--require',
          require.resolve('tsx/cjs'),
          '--eval',
          `
            require(${JSON.stringify(require.resolve('../node-environment-baseline'))})
            const { ImmediateTracker, runWithNativeImmediateTracking } =
              require(${JSON.stringify(require.resolve('./fast-set-immediate.external'))})
            const events = []
            const expectedError = new Error('expected native error')
            process.on('uncaughtException', (error) => {
              if (error !== expectedError) {
                console.error(error)
                process.exit(1)
              }
              events.push('uncaughtException')
            })

            const tracker = new ImmediateTracker()
            runWithNativeImmediateTracking(tracker, async () => {
              setImmediate(() => {
                events.push('immediate')
                if (${JSON.stringify(kind)} === 'nextTick') {
                  process.nextTick(() => {
                    events.push('nextTick')
                    throw expectedError
                  })
                } else {
                  throw expectedError
                }
              })
              await new Promise((resolve) => tracker.onIdle(resolve))
              events.push('ready')
              setImmediate(() => events.push('later immediate'))
              await new Promise((resolve) => tracker.onIdle(resolve))
              console.log(JSON.stringify(events))
            }).catch((error) => {
              console.error(error)
              process.exit(1)
            })
          `,
        ],
        { timeout: 10_000, killSignal: 'SIGKILL' }
      )
      try {
        const { stdout, stderr } = await subprocess
        expect(stderr).toBe('')
        expect(JSON.parse(stdout)).toEqual([
          'immediate',
          ...(kind === 'nextTick' ? ['nextTick'] : []),
          'uncaughtException',
          'ready',
          'later immediate',
        ])
      } finally {
        subprocess.child.kill('SIGKILL')
      }
    }
  })

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
      setTimeout(() => {
        DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
        log('timeout 1')

        setImmediate(() => {
          log('timeout 1 -> immediate 1')

          // In the patch, we rethrow the synchronous error asynchronously,
          // so unfortunately ticks will run before uncaughtException.
          process.nextTick(() => {
            log('timeout 1 -> immediate 1 -> nextTick')
          })

          throw error
        })

        setImmediate(() => {
          log('timeout 1 -> immediate 2')
        })
      })
    })

    setTimeout(() => {
      log('timeout 2')
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
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      'timeout 1 -> immediate 1 -> nextTick', // undesirable (too early) but acceptable

      // FIXME: no async context in uncaughtException
      // `uncaughtException - ${contextValue}`,
      `uncaughtException - undefined`,

      // ======================
      'timeout 1 -> immediate 2',
      // ===================================
      'timeout 2',
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
      setTimeout(() => {
        DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
        log('timeout 1')
        setImmediate(() => {
          log('timeout 1 -> immediate 1')
          process.nextTick(() => {
            log(`timeout 1 -> immediate 1 -> nextTick - ${Ctx.getStore()}`)
            throw error
          })
        })
        setImmediate(() => {
          log('timeout 1 -> immediate 2')
        })
      })
    })

    setTimeout(() => {
      log('timeout 2')
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
      'timeout 1',
      // ======================
      'timeout 1 -> immediate 1',
      `timeout 1 -> immediate 1 -> nextTick - ${contextValue}`,

      // FIXME: no async context in uncaughtException
      // `uncaughtException - ${contextValue}`,
      `uncaughtException - undefined`,

      // ======================
      'timeout 1 -> immediate 2',
      // ===================================
      'timeout 2',
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

    setTimeout(() => {
      DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
      log('timeout 1')
      process.nextTick(() => {
        log('timeout 1 -> nextTick')
        throw error
      })
      setImmediate(() => {
        log('timeout 1 -> immediate 1')
      })
      setImmediate(() => {
        log('timeout 1 -> immediate 2')
      })
    })

    setTimeout(() => {
      log('timeout 2')
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
      'timeout 1',
      'timeout 1 -> nextTick',
      'uncaughtException',
      // ======================
      'timeout 1 -> immediate 1',
      // ======================
      'timeout 1 -> immediate 2',
      // ===================================
      'timeout 2',
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
        setTimeout(() => {
          DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
          log('timeout 1')
          setImmediate(() => {
            return immediate('timeout 1 -> immediate 1', error, log)
          })
          setImmediate(() => {
            log('timeout 1 -> immediate 2')
          })
        })
      })

      setTimeout(() => {
        log('timeout 2')
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
        'timeout 1',
        // ======================
        'timeout 1 -> immediate 1',
        'timeout 1 -> immediate 1 :: erroring',

        // FIXME: we would like to observe the rejection here...
        // `unhandledRejection - ${contextValue}`,

        // ======================
        'timeout 1 -> immediate 2',

        // FIXME: ...but it happens here, after the second immediate:
        `unhandledRejection - ${contextValue}`,
        // This is because unhandled rejections are only processed after the nextTick queue is empty:
        // https://github.com/nodejs/node/blob/d546e7fd0bc3cbb4bcc2baae6f3aa44d2e81a413/lib/internal/process/task_queues.js#L104-L105
        // and in our implementation, the second immediate is actually a nextTick.

        // ===================================
        'timeout 2',
      ])
    })
  })
})

describe('error recovery', () => {
  describe('when crashing, it bails out to native setImmediate and does not break subsequent calls', () => {
    const expectCorrectRunToWork = async () => {
      const { log, logs } = createLogger()
      const done = createPromiseWithResolvers<void>()

      setTimeout(() => {
        try {
          DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
        } catch (err) {
          return done.reject(err)
        }

        log('timeout 1')

        setImmediate(() => {
          log('timeout 1 -> immediate 1')
        })
        setImmediate(() => {
          log('timeout 1 -> immediate 2')
        })
      })

      setTimeout(() => {
        log('timeout 2')

        try {
          expectNoPendingImmediates()
          done.resolve()
        } catch (err) {
          done.reject(err)
        }
      })

      await done.promise

      expect(logs).toEqual([
        'timeout 1',
        'timeout 1 -> immediate 1',
        'timeout 1 -> immediate 2',
        'timeout 2',
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
          const scheduleTimeout = createAtomicTimerGroup()

          scheduleTimeout(() => {
            // NOTE: native immediate
            setImmediate(() => {
              log('immediate 1 (native)')
              dones[0].resolve()
            })
          })
          scheduleTimeout(() => {
            DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
            log('timeout 1')

            setImmediate(() => {
              log('timeout 1 -> immediate 1 (patched)')
              dones[1].resolve()
            })

            setImmediate(() => {
              log('timeout 1 -> immediate 2 (patched)')
              dones[2].resolve()
            })

            scheduleCrash(() => {
              expect(() => invalidCall()).toThrow()
            })
          })

          await Promise.all(dones.map((d) => d.promise))

          expect(logs).toEqual([
            'timeout 1',
            // The queued immediates should be rescheduled using native `setImmediate`,
            // so we should observe them happening after the native one we scheduled earlier
            'immediate 1 (native)',
            'timeout 1 -> immediate 1 (patched)',
            'timeout 1 -> immediate 2 (patched)',
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
          const scheduleTimeout = createAtomicTimerGroup()

          scheduleTimeout(() => {
            // NOTE: native immediate
            setImmediate(() => {
              log('immediate 1 (native)')
              dones[0].resolve()
            })
          })
          scheduleTimeout(() => {
            DANGEROUSLY_runPendingImmediatesAfterCurrentTask()
            log('timeout 1')

            setImmediate(() => {
              log('timeout 1 -> immediate 1 (patched)')
              dones[1].resolve()
            })

            setImmediate(() => {
              log('timeout 1 -> immediate 2 (patched)')
              scheduleCrash(() => {
                expect(() => expectNoPendingImmediates()).toThrow()
              })
            })

            setImmediate(() => {
              log('timeout 1 -> immediate 3 (patched)')
              dones[2].resolve()
            })
          })

          await Promise.all(dones.map((d) => d.promise))

          expect(logs).toEqual([
            'timeout 1',
            'timeout 1 -> immediate 1 (patched)',
            'timeout 1 -> immediate 2 (patched)',
            // The remaining queued immediate should be rescheduled using native `setImmediate`,
            // so we should observe it happening after the native one we scheduled earlier
            'immediate 1 (native)',
            'timeout 1 -> immediate 3 (patched)',
          ])

          // The next run should work correctly
          await expectCorrectRunToWork()
        }
      )
    })
  })
})

describe('module re-evaluation', () => {
  it('keeps unpatchedSetImmediate bound to the base original', () => {
    const baseUnpatchedSetImmediate = unpatchedSetImmediate

    for (let i = 0; i < 3; i++) {
      const previousPatchedSetImmediate = globalThis.setImmediate
      jest.resetModules()

      const reloaded =
        require('./fast-set-immediate.external') as typeof import('./fast-set-immediate.external')

      expect(reloaded.unpatchedSetImmediate).toBe(baseUnpatchedSetImmediate)
      expect(reloaded.unpatchedSetImmediate).not.toBe(
        previousPatchedSetImmediate
      )
    }
  })
})
