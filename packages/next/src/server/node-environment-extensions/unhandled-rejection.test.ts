/**
 * Testing unhandled rejections in Jest is quite tricky because by default Jest will fail the test
 * if there are any unhandled rejections. This is a unit test and we want to test the node patch
 * with as little manipulation of the runtime as possible. The strategy we take is to run a special
 * function in each test inside a Worker thread. This allows us to have an isolated node environment
 * that won't interfere with anything going on inside the process running Jest. We support a native TS authoring
 * experience by passing the code for the Worker as a string gathered from toString-ing the worker test function.
 *
 * This is convenient for typescript and linting but it isn't perfect because it might trick you into thinking
 * you can share state from inside and outside the work function which you cannot. Instead you must report serializable
 * values back to the main thread using `reportResult`. Another place to watch out for is that requiring code in the
 * worker requires targeting next/dist files (javascript only) and you must target from the package root down.
 * Environment variables are not carried over to the worker thread so if you you want to configure them it
 * must be done inside the worker function implementation.
 *
 * I'm largely happy with this setup because you can mostly ignore the fact that there are two worlds
 * but if you make changes consider the context these tests are running in otherwise you might get unexpected results.
 *
 * @jest-environment node
 */

/* eslint-disable @next/internal/typechecked-require */

type ReportableResult =
  | CountReport
  | UHRReport
  | ErrorReport
  | OutputReport
  | ErrorLogReport
  | SerializableDataReport
type ErrorReport = { type: 'error'; message: string }
type OutputReport = { type: 'output'; message: string }
type CountReport = {
  type: 'count'
  count: number
}
type UHRReport = {
  type: 'uhr'
  reason: string
}
type ErrorLogReport = {
  type: 'error-log'
  message: string
}
type SerializableDataReport = {
  type: 'serialized'
  key: string
  data: string
}

declare global {
  function reportResult(result: ReportableResult): void
}

import type { WorkUnitStore } from '../app-render/work-unit-async-storage.external'

import { Worker } from 'node:worker_threads'

type WorkerResult = {
  exitCode: number
  stderr: string
  uhr: Array<UHRReport>
  count: Array<CountReport>
  errorLog: Array<string>
  data: Record<string, unknown>
  messages: Array<ReportableResult>
}

export function runWorkerCode(fn: Function): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const script = `
      const { parentPort } = require('node:worker_threads');
      (async () => {
        const { AsyncLocalStorage } = require('node:async_hooks');
        // We need to put this on the global because Next.js does not import it
        // from node directly to be compatible with edge runtimes.
        globalThis.AsyncLocalStorage = AsyncLocalStorage;

        const { parentPort } = require('node:worker_threads');
        global.reportResult = (value) => {
          parentPort?.postMessage(value);
        };

        const fn = (${fn.toString()});
        try {
          const out = await fn();
          await new Promise(r => setImmediate(r));
          reportResult({ type: 'result', out });
        } catch (e) {
          reportResult({ type: 'error', message: String(e && e.message || e) });
        }
      })();
    `

    const w = new Worker(script, {
      eval: true,
      workerData: null,
      argv: [],
      execArgv: [],
      stderr: true,
      stdout: false,
    })

    const messages: Array<ReportableResult> = []
    const uhr: Array<UHRReport> = []
    const count: Array<CountReport> = []
    const errorLog: Array<string> = []
    const data = {} as Record<string, unknown>
    let stderr = ''

    w.on('message', (m) => {
      messages.push(m)
      switch (m.type) {
        case 'uhr':
          uhr.push(m.reason)
          break
        case 'count':
          count.push(m.count)
          break
        case 'error-log':
          errorLog.push(m.message)
          break
        case 'serialized':
          data[m.key] = JSON.parse(m.data)
          break
        default:
          break
      }
    })
    w.on('error', (err) => console.error('Worker error', err))
    w.on('error', reject)
    w.stderr?.on('data', (b) => (stderr += String(b)))
    w.on('exit', (code) =>
      resolve({
        exitCode: code ?? -1,
        uhr,
        count,
        errorLog,
        data,
        messages,
        stderr,
      })
    )
  })
}

describe('unhandled-rejection filter', () => {
  describe('environment variable configuration', () => {
    it('should install filter by default', async () => {
      async function testForWorker() {
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        reportResult({
          type: 'count',
          count: process.listeners('unhandledRejection').length,
        })
      }

      const { messages, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ count: 1 })])
      )
    })

    it('should not install filter when disabled', async () => {
      async function testForWorker() {
        process.env.NEXT_UNHANDLED_REJECTION_FILTER = 'disabled'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        reportResult({
          type: 'count',
          count: process.listeners('unhandledRejection').length,
        })
      }

      const { messages, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ count: 0 })])
      )
    })

    it('should install filter rejections when environment variable is enabled', async () => {
      async function testForWorker() {
        process.env.NEXT_UNHANDLED_REJECTION_FILTER = 'enabled'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        reportResult({
          type: 'count',
          count: process.listeners('unhandledRejection').length,
        })
      }

      const { messages, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ count: 1 })])
      )
    })

    it('should install filter rejections when environment variable is enabled in debug mode', async () => {
      async function testForWorker() {
        process.env.NEXT_UNHANDLED_REJECTION_FILTER = 'debug'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        reportResult({
          type: 'count',
          count: process.listeners('unhandledRejection').length,
        })
      }

      const { messages, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ count: 1 })])
      )
    })

    it('should warn once when you uninstall the filter with removeListener', async () => {
      async function testForWorker() {
        const originalWarn = console.warn
        console.warn = (...args: Array<any>) => {
          reportResult({ type: 'error-log', message: args.join(' ') })
          originalWarn(...args)
        }

        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        const filterListener = process.listeners('unhandledRejection')[0]
        process.removeListener('unhandledRejection', filterListener)
        process.removeListener('unhandledRejection', filterListener)
        process.removeAllListeners()
      }

      const { errorLog, exitCode } = await runWorkerCode(testForWorker)
      expect(exitCode).toBe(0)
      expect(errorLog).toMatchInlineSnapshot(`
       [
         "[Next.js Unhandled Rejection Filter]: Uninstalling filter because \`process.removeListener('unhandledRejection', listener)\` was called with the filter listener. Uninstalling this filter is not recommended and will cause you to observe 'unhandledRejection' events related to intentionally aborted prerenders.

       You can silence warnings related to this behavior by running Next.js with \`NEXT_UNHANDLED_REJECTION_FILTER=silent\` environment variable.

       You can debug event listener operations by running Next.js with \`NEXT_UNHANDLED_REJECTION_FILTER=debug\` environment variable.",
       ]
      `)
    })

    it('should warn once when you uninstall the filter with off', async () => {
      async function testForWorker() {
        const originalWarn = console.warn
        console.warn = (...args: Array<any>) => {
          reportResult({ type: 'error-log', message: args.join(' ') })
          originalWarn(...args)
        }

        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        const filterListener = process.listeners('unhandledRejection')[0]
        process.off('unhandledRejection', filterListener)
        process.off('unhandledRejection', filterListener)
        process.removeAllListeners()
      }

      const { errorLog, exitCode } = await runWorkerCode(testForWorker)
      expect(exitCode).toBe(0)
      expect(errorLog).toMatchInlineSnapshot(`
       [
         "[Next.js Unhandled Rejection Filter]: Uninstalling filter because \`process.removeListener('unhandledRejection', listener)\` was called with the filter listener. Uninstalling this filter is not recommended and will cause you to observe 'unhandledRejection' events related to intentionally aborted prerenders.

       You can silence warnings related to this behavior by running Next.js with \`NEXT_UNHANDLED_REJECTION_FILTER=silent\` environment variable.

       You can debug event listener operations by running Next.js with \`NEXT_UNHANDLED_REJECTION_FILTER=debug\` environment variable.",
       ]
      `)
    })

    it('should warn once when you uninstall the filter with removeAllListeners', async () => {
      async function testForWorker() {
        const originalWarn = console.warn
        console.warn = (...args: Array<any>) => {
          reportResult({ type: 'error-log', message: args.join(' ') })
          originalWarn(...args)
        }

        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        const filterListener = process.listeners('unhandledRejection')[0]
        process.removeAllListeners()
        process.off('unhandledRejection', filterListener)
        process.removeListener('unhandledRejection', filterListener)
      }

      const { errorLog, exitCode } = await runWorkerCode(testForWorker)
      expect(exitCode).toBe(0)
      expect(errorLog).toMatchInlineSnapshot(`
       [
         "[Next.js Unhandled Rejection Filter]: Uninstalling filter because \`process.removeAllListeners()\` was called. Uninstalling this filter is not recommended and will cause you to observe 'unhandledRejection' events related to intentionally aborted prerenders.

       You can silence warnings related to this behavior by running Next.js with \`NEXT_UNHANDLED_REJECTION_FILTER=silent\` environment variable.

       You can debug event listener operations by running Next.js with \`NEXT_UNHANDLED_REJECTION_FILTER=debug\` environment variable.",
       ]
      `)
    })

    it('does not warn when environment variable is set to silent mode', async () => {
      async function testForWorker() {
        process.env.NEXT_UNHANDLED_REJECTION_FILTER = 'silent'
        const originalWarn = console.warn
        console.warn = (...args: Array<any>) => {
          reportResult({ type: 'error-log', message: args.join(' ') })
          originalWarn(...args)
        }

        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        const filterListener = process.listeners('unhandledRejection')[0]
        process.removeAllListeners()
        process.off('unhandledRejection', filterListener)
        process.removeListener('unhandledRejection', filterListener)
      }

      const { errorLog, exitCode } = await runWorkerCode(testForWorker)
      expect(exitCode).toBe(0)
      expect(errorLog).toMatchInlineSnapshot(`[]`)
    })
  })

  describe('filtering functionality', () => {
    it('should suppress rejections from aborted prerender contexts', async () => {
      async function testForWorker() {
        process.env.NEXT_UNHANDLED_REJECTION_FILTER = '1'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        process.on('unhandledRejection', (reason) => {
          reportResult({ type: 'uhr', reason: String(reason) })
        })

        Promise.reject('outside store + before')
        workUnitAsyncStorage.run(
          {
            type: 'prerender',
            renderSignal: { aborted: true },
          } as WorkUnitStore,
          async () => {
            Promise.reject('immediate abort + sync')
            await 1
            Promise.reject('immediate abort + micro')
            await new Promise((r) => setTimeout(r, 10))
            Promise.reject('immediate abort + task')
          }
        )
        const delayedAbortStore = {
          type: 'prerender',
          renderSignal: { aborted: false },
        }
        workUnitAsyncStorage.run(
          delayedAbortStore as WorkUnitStore,
          async () => {
            Promise.reject('before abort + sync')
            await 1
            Promise.reject('before abort + micro')
            await new Promise((r) => setTimeout(r, 10))
            Promise.reject('before abort + task')
            await new Promise((r) => setImmediate(r))
            // We mutate this after a task b/c in Next.js this is always done right at the beginning
            // of a task and any promises rejecting in prior tasks would have already observed their
            // rejections as unhandled without the aborted signal
            delayedAbortStore.renderSignal.aborted = true
            Promise.reject('after abort + sync')
            await 1
            Promise.reject('after abort + micro')
            await new Promise((r) => setTimeout(r, 10))
            Promise.reject('delayed abort + task')
          }
        )
        Promise.reject('outside store + after')
      }

      const { uhr, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(uhr).toEqual(
        expect.arrayContaining([
          'outside store + before',
          'outside store + after',
          'before abort + sync',
          'before abort + micro',
          'before abort + task',
        ])
      )
    })

    it('should suppress rejections from aborted prerender-client contexts', async () => {
      async function testForWorker() {
        process.env.NEXT_UNHANDLED_REJECTION_FILTER = '1'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        process.on('unhandledRejection', (reason) => {
          reportResult({ type: 'uhr', reason: String(reason) })
        })

        Promise.reject('outside store + before')
        workUnitAsyncStorage.run(
          {
            type: 'prerender-client',
            renderSignal: { aborted: true },
          } as WorkUnitStore,
          async () => {
            Promise.reject('immediate abort + sync')
            await 1
            Promise.reject('immediate abort + micro')
            await new Promise((r) => setTimeout(r, 10))
            Promise.reject('immediate abort + task')
          }
        )
        const delayedAbortStore = {
          type: 'prerender-client',
          renderSignal: { aborted: false },
        }
        workUnitAsyncStorage.run(
          delayedAbortStore as WorkUnitStore,
          async () => {
            Promise.reject('before abort + sync')
            await 1
            Promise.reject('before abort + micro')
            await new Promise((r) => setTimeout(r, 10))
            Promise.reject('before abort + task')
            await new Promise((r) => setImmediate(r))
            // We mutate this after a task b/c in Next.js this is always done right at the beginning
            // of a task and any promises rejecting in prior tasks would have already observed their
            // rejections as unhandled without the aborted signal
            delayedAbortStore.renderSignal.aborted = true
            Promise.reject('after abort + sync')
            await 1
            Promise.reject('after abort + micro')
            await new Promise((r) => setTimeout(r, 10))
            Promise.reject('delayed abort + task')
          }
        )
        Promise.reject('outside store + after')
      }

      const { uhr, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(uhr).toEqual(
        expect.arrayContaining([
          'outside store + before',
          'outside store + after',
          'before abort + sync',
          'before abort + micro',
          'before abort + task',
        ])
      )
    })

    it('should suppress rejections from aborted prerender-runtime contexts', async () => {
      async function testForWorker() {
        process.env.NEXT_UNHANDLED_REJECTION_FILTER = '1'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        process.on('unhandledRejection', (reason) => {
          reportResult({ type: 'uhr', reason: String(reason) })
        })

        Promise.reject('outside store + before')
        workUnitAsyncStorage.run(
          {
            type: 'prerender-runtime',
            renderSignal: { aborted: true },
          } as WorkUnitStore,
          async () => {
            Promise.reject('immediate abort + sync')
            await 1
            Promise.reject('immediate abort + micro')
            await new Promise((r) => setTimeout(r, 10))
            Promise.reject('immediate abort + task')
          }
        )
        const delayedAbortStore = {
          type: 'prerender-runtime',
          renderSignal: { aborted: false },
        }
        workUnitAsyncStorage.run(
          delayedAbortStore as WorkUnitStore,
          async () => {
            Promise.reject('before abort + sync')
            await 1
            Promise.reject('before abort + micro')
            await new Promise((r) => setTimeout(r, 10))
            Promise.reject('before abort + task')
            await new Promise((r) => setImmediate(r))
            // We mutate this after a task b/c in Next.js this is always done right at the beginning
            // of a task and any promises rejecting in prior tasks would have already observed their
            // rejections as unhandled without the aborted signal
            delayedAbortStore.renderSignal.aborted = true
            Promise.reject('after abort + sync')
            await 1
            Promise.reject('after abort + micro')
            await new Promise((r) => setTimeout(r, 10))
            Promise.reject('delayed abort + task')
          }
        )
        Promise.reject('outside store + after')
      }

      const { uhr, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(uhr).toEqual(
        expect.arrayContaining([
          'outside store + before',
          'outside store + after',
          'before abort + sync',
          'before abort + micro',
          'before abort + task',
        ])
      )
    })

    it('should pass through rejections from non-aborted prerender contexts', async () => {
      async function testForWorker() {
        process.env.NEXT_UNHANDLED_REJECTION_FILTER = '1'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        process.on('unhandledRejection', (reason) => {
          reportResult({ type: 'uhr', reason: String(reason) })
        })

        Promise.reject('outside store + before')
        workUnitAsyncStorage.run(
          {
            type: 'request',
          } as WorkUnitStore,
          async () => {
            Promise.reject('in store + sync')
            await 1
            Promise.reject('in store + micro')
            await new Promise((r) => setTimeout(r, 10))
            Promise.reject('in store + task')
          }
        )
        Promise.reject('outside store + after')
      }

      const { uhr, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(uhr).toEqual(
        expect.arrayContaining([
          'outside store + before',
          'outside store + after',
          'in store + sync',
          'in store + micro',
          'in store + task',
        ])
      )
    })

    it('should call console.error when no handlers are present', async () => {
      async function testForWorker() {
        process.env.NEXT_UNHANDLED_REJECTION_FILTER = '1'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        console.error = (...args: Array<any>) => {
          reportResult({ type: 'error-log', message: args.join(' ') })
        }

        Promise.reject('BOOM')
      }

      const { uhr, errorLog, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(uhr).toEqual([])
      expect(errorLog).toEqual(['Unhandled Rejection: BOOM'])
    })
  })

  describe('process method interception', () => {
    it('should handle process.once listeners correctly', async () => {
      async function testForWorker() {
        process.env.NEXT_UNHANDLED_REJECTION_FILTER = 'enabled'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        let callCount = 0

        process.on('unhandledRejection', () => {
          // this is a noop handler so that we don't trigger the default
          // process killing behavior after the once handler is called
        })

        process.once('unhandledRejection', (reason) => {
          callCount++
          reportResult({ type: 'uhr', reason: String(reason) })
        })

        Promise.reject('FIRST')
        Promise.reject('SECOND')
        Promise.reject('THIRD')
        Promise.reject('FOURTH')
        Promise.reject('FIFTH')

        await new Promise((r) => setTimeout(r, 10))

        reportResult({ type: 'count', count: callCount })
      }

      const { uhr, count, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(uhr).toEqual(['FIRST'])
      expect(count).toEqual([1])
    })

    it('should handle process.removeListener correctly', async () => {
      async function testForWorker() {
        process.env.NEXT_UNHANDLED_REJECTION_FILTER = 'enabled'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        const handler1 = (reason: unknown) => {
          reportResult({ type: 'uhr', reason: `[1]: ${String(reason)}` })
        }
        const handler2 = (reason: unknown) => {
          reportResult({ type: 'uhr', reason: `[2]: ${String(reason)}` })
        }

        process.on('unhandledRejection', handler1)
        process.on('unhandledRejection', handler2)
        process.once('unhandledRejection', handler1)
        process.once('unhandledRejection', handler2)
        process.addListener('unhandledRejection', handler1)
        process.addListener('unhandledRejection', handler2)
        process.prependListener('unhandledRejection', handler1)
        process.prependListener('unhandledRejection', handler2)
        process.prependOnceListener('unhandledRejection', handler1)
        process.prependOnceListener('unhandledRejection', handler2)

        process.off('unhandledRejection', handler1)
        process.removeListener('unhandledRejection', handler1)

        Promise.reject('BOOM1')
        Promise.reject('BOOM2')
        await new Promise((r) => setTimeout(r, 10))

        process.off('unhandledRejection', handler1)
        process.removeListener('unhandledRejection', handler1)
        process.off('unhandledRejection', handler2)
        process.removeListener('unhandledRejection', handler2)

        Promise.reject('BOOM3')
        await new Promise((r) => setTimeout(r, 10))
      }

      const { uhr, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(uhr).toEqual([
        // ... BOOM1 time
        '[2]: BOOM1', // prependOnceListener(... handler2)
        '[1]: BOOM1', // prependOnceListener(... handler1)
        '[2]: BOOM1', // prependListener(... handler2)
        '[1]: BOOM1', // prependListener(... handler1)
        '[1]: BOOM1', // process.on(... handler1)
        '[2]: BOOM1', // process.on(... handler2)
        // we removed the process.once(..., handler1)
        '[2]: BOOM1', // process.once(... handler2)
        // we removed the process.addListener(..., handler1)
        '[2]: BOOM1', // process.addListener(... handler2)
        // ... BOOM2 time
        // once listeners are exhausted so they are skipped
        '[2]: BOOM2', // prependListener(... handler2)
        '[1]: BOOM2', // prependListener(... handler1)
        '[1]: BOOM2', // process.on(... handler1)
        '[2]: BOOM2', // process.on(... handler2)
        // once listeners are exhausted so they are skipped
        // we removed the process.addListener(..., handler1)
        '[2]: BOOM2', // process.addListener(... handler2)
        // ... BOOM3 time
        // all handler1 handlers have been removed
        '[2]: BOOM3', // prependListener(... handler2)
        // all remaining handler2 handlers have been removed
      ])
    })

    it('should uninstall filter when removeAllListeners() is called without arguments', async () => {
      async function testForWorker() {
        process.env.NEXT_UNHANDLED_REJECTION_FILTER = 'enabled'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        process.on('unhandledRejection', (reason) => {
          reportResult({ type: 'uhr', reason: String(reason) })
        })

        Promise.reject('outside 1')

        await workUnitAsyncStorage.run(
          {
            type: 'prerender',
            renderSignal: { aborted: true },
          } as WorkUnitStore,
          async () => {
            await new Promise((r) => setImmediate(r))
            Promise.reject('Should be filtered out')
            await new Promise((r) => setImmediate(r))
          }
        )

        process.removeAllListeners()

        process.on('unhandledRejection', (reason) => {
          reportResult({ type: 'uhr', reason: String(reason) })
        })

        Promise.reject('outside 2')

        // After uninstalling, rejections that would be filtered should now pass through
        await workUnitAsyncStorage.run(
          {
            type: 'prerender',
            renderSignal: { aborted: true },
          } as WorkUnitStore,
          async () => {
            await new Promise((r) => setImmediate(r))
            Promise.reject('should not be filtered after uninstall')
            await new Promise((r) => setImmediate(r))
          }
        )

        Promise.reject('outside 3')
      }

      const { uhr, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(uhr).toEqual([
        'outside 1',
        'outside 2',
        'should not be filtered after uninstall',
        'outside 3',
      ])
    })

    it('should not uninstall filter when removeAllListeners("unhandledRejection") is called', async () => {
      async function testForWorker() {
        process.env.NEXT_UNHANDLED_REJECTION_FILTER = 'enabled'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        process.on('unhandledRejection', (reason) => {
          reportResult({ type: 'uhr', reason: String(reason) })
        })

        Promise.reject('outside 1')

        await workUnitAsyncStorage.run(
          {
            type: 'prerender',
            renderSignal: { aborted: true },
          } as WorkUnitStore,
          async () => {
            await new Promise((r) => setImmediate(r))
            Promise.reject('Should be filtered out')
            await new Promise((r) => setImmediate(r))
          }
        )

        process.removeAllListeners('unhandledRejection')

        process.on('unhandledRejection', (reason) => {
          reportResult({ type: 'uhr', reason: String(reason) })
        })

        Promise.reject('outside 2')

        // After uninstalling, rejections that would be filtered should now pass through
        await workUnitAsyncStorage.run(
          {
            type: 'prerender',
            renderSignal: { aborted: true },
          } as WorkUnitStore,
          async () => {
            await new Promise((r) => setImmediate(r))
            Promise.reject('Should be filtered out')
            await new Promise((r) => setImmediate(r))
          }
        )
        Promise.reject('outside 3')
      }

      const { uhr, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(uhr).toEqual(['outside 1', 'outside 2', 'outside 3'])
    })

    it('should not affect other listeners when adding/removing listeners from within a handler', async () => {
      // This test asserts that our patch preserves node's semantics that all listeners registered when
      // an event is emitted will be invoked regardless of whether there are mutations to the listeners
      // during event handling.
      async function testForWorker() {
        process.env.NEXT_UNHANDLED_REJECTION_FILTER = 'enabled'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        const onceHandler = (reason: unknown) => {
          reportResult({ type: 'uhr', reason: `once: ${String(reason)}` })
        }

        const handler1 = (reason: unknown) => {
          reportResult({
            type: 'count',
            count: process.listeners('unhandledRejection').length,
          })
          reportResult({ type: 'uhr', reason: `handler1: ${String(reason)}` })

          // Try to add a new handler from within this handler
          const appendHandler = (innerReason: unknown) => {
            reportResult({
              type: 'uhr',
              reason: `append: ${String(innerReason)}`,
            })
          }
          process.on('unhandledRejection', appendHandler)

          const prependHandler = (innerReason: unknown) => {
            reportResult({
              type: 'uhr',
              reason: `prepend: ${String(innerReason)}`,
            })
          }
          process.prependListener('unhandledRejection', prependHandler)

          // Try to remove handler3 from within this handler
          process.removeListener('unhandledRejection', handler3)
        }

        const handler2 = (reason: unknown) => {
          reportResult({ type: 'uhr', reason: `handler2: ${String(reason)}` })
        }

        const handler3 = (reason: unknown) => {
          reportResult({ type: 'uhr', reason: `handler3: ${String(reason)}` })
        }

        const handler4 = (reason: unknown) => {
          reportResult({ type: 'uhr', reason: `handler4: ${String(reason)}` })
        }

        // Add handlers in a specific order
        process.once('unhandledRejection', onceHandler)
        process.on('unhandledRejection', handler1) // This will modify listeners during execution
        process.on('unhandledRejection', handler2) // Should always run
        process.on('unhandledRejection', handler3) // Will be removed by handler1, but should still run for first event
        process.on('unhandledRejection', handler4) // Should always run

        // First rejection - all original handlers should run despite handler1 modifying the list
        Promise.reject('first')
        // Second rejection - handler3 should be gone, dynamic handler should be present
        Promise.reject('second')
        await new Promise((r) => setTimeout(r, 10))
      }

      const { uhr, count, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(count).toEqual([
        // First event, the once handler is removed before execution so it no longer counts
        // But we also have our filter handler
        5,
        // Then when the second event happens we have added 2 additional handlers and removed 1
        // So the count increase by 1
        6,
      ])
      expect(uhr).toEqual([
        // First event - all original handlers should run
        'once: first',
        'handler1: first',
        'handler2: first',
        'handler3: first', // Still runs even though handler1 removed it
        'handler4: first',

        // Second event - handler3 is gone, dynamic handler is present
        'prepend: second',
        'handler1: second',
        'handler2: second',
        'handler4: second',
        'append: second', // The dynamically added handler now runs
      ])
    })

    it('should preserve native function toString behavior for patched process methods', async () => {
      async function testForWorker() {
        const originalMethods = [
          process.on,
          process.addListener,
          process.off,
          process.removeListener,
          process.prependListener,
          process.once,
          process.prependOnceListener,
          process.removeAllListeners,
          process.listeners,
        ]

        const originalToStrings = originalMethods.map((m) => m.toString())
        const originalNames = originalMethods.map((m) => m.name)

        process.env.NEXT_UNHANDLED_REJECTION_FILTER = 'enabled'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        const patchedMethods = [
          process.on,
          process.addListener,
          process.off,
          process.removeListener,
          process.prependListener,
          process.once,
          process.prependOnceListener,
          process.removeAllListeners,
          process.listeners,
        ]

        const patchedToStrings = patchedMethods.map((m) => m.toString())
        const patchedNames = patchedMethods.map((m) => m.name)

        reportResult({
          type: 'serialized',
          key: 'originalToStrings',
          data: JSON.stringify(originalToStrings),
        })
        reportResult({
          type: 'serialized',
          key: 'patchedToStrings',
          data: JSON.stringify(patchedToStrings),
        })
        reportResult({
          type: 'serialized',
          key: 'originalNames',
          data: JSON.stringify(originalNames),
        })
        reportResult({
          type: 'serialized',
          key: 'patchedNames',
          data: JSON.stringify(patchedNames),
        })
      }

      const { data, exitCode } = await runWorkerCode(testForWorker)

      type ReportedData = {
        originalToStrings: string[]
        patchedToStrings: string[]
        originalNames: string[]
        patchedNames: string[]
      }

      const results = data as unknown as ReportedData

      expect(results.originalNames).toEqual(results.patchedNames)
      expect(results.originalToStrings).toEqual(results.patchedToStrings)
      expect(exitCode).toBe(0)
    })
  })

  describe('error handling in handlers', () => {
    it('should handle errors thrown by user handlers gracefully', async () => {
      async function testForWorker() {
        process.env.NEXT_UNHANDLED_REJECTION_FILTER = 'enabled'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        process.on('unhandledRejection', () => {
          throw new Error('Handler error')
        })

        process.once('uncaughtException', (error) => {
          reportResult({ type: 'error', message: error.message })
        })

        workUnitAsyncStorage.run(
          { type: 'request' } as WorkUnitStore,
          async () => {
            Promise.reject(new Error('Original error'))
            await new Promise((r) => setImmediate(r))
            await new Promise((r) => setTimeout(r, 10))
          }
        )
      }

      const { messages, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'error', message: 'Handler error' }),
        ])
      )
    })
  })

  describe('integration with existing listeners', () => {
    it('should capture and preserve existing listeners during installation', async () => {
      async function testForWorker() {
        // Add listener before installing filter
        process.on('unhandledRejection', (reason) => {
          reportResult({ type: 'uhr', reason: `existing: ${String(reason)}` })
        })

        process.env.NEXT_UNHANDLED_REJECTION_FILTER = 'enabled'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        // Test non-filtered rejection
        workUnitAsyncStorage.run(
          { type: 'request' } as WorkUnitStore,
          async () => {
            Promise.reject('passes through')
            await new Promise((r) => setTimeout(r, 10))
          }
        )

        // Test filtered rejection
        workUnitAsyncStorage.run(
          {
            type: 'prerender',
            renderSignal: { aborted: true },
          } as WorkUnitStore,
          async () => {
            Promise.reject('should be filtered')
            await new Promise((r) => setTimeout(r, 10))
          }
        )
      }

      const { uhr, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(uhr).toEqual(['existing: passes through'])
    })

    it('should be able to clear listeners that existed prior to installation', async () => {
      async function testForWorker() {
        // Add listener before installing filter
        process.on('unhandledRejection', (reason) => {
          reportResult({ type: 'uhr', reason: `existing: ${String(reason)}` })
        })

        process.env.NEXT_UNHANDLED_REJECTION_FILTER = 'enabled'
        require('next/dist/server/node-environment-extensions/unhandled-rejection')

        process.removeAllListeners('unhandledRejection')

        process.on('unhandledRejection', (reason) => {
          reportResult({ type: 'uhr', reason: `after: ${String(reason)}` })
        })

        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        // Test non-filtered rejection
        workUnitAsyncStorage.run(
          { type: 'request' } as WorkUnitStore,
          async () => {
            Promise.reject('passes through')
            await new Promise((r) => setTimeout(r, 10))
          }
        )

        // Test filtered rejection
        workUnitAsyncStorage.run(
          {
            type: 'prerender',
            renderSignal: { aborted: true },
          } as WorkUnitStore,
          async () => {
            Promise.reject('should be filtered')
            await new Promise((r) => setTimeout(r, 10))
          }
        )
      }

      const { uhr, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(uhr).toEqual(['after: passes through'])
    })
  })
})
