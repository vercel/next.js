/**
 * Testing console patching in Jest requires isolation since console methods are heavily used
 * by the test runner itself. We use the same worker thread strategy as unhandled-rejection.test.ts
 * to ensure our patches don't interfere with Jest's own console usage.
 *
 * @jest-environment node
 */

/* eslint-disable @next/internal/typechecked-require */

type ReportableResult =
  | ConsoleCallReport
  | ErrorReport
  | OutputReport
  | SerializableDataReport

type ConsoleCallReport = {
  type: 'console-call'
  method: string
  input: string
}

type ErrorReport = { type: 'error'; message: string }
type OutputReport = { type: 'output'; message: string }
type SerializableDataReport = {
  type: 'serialized'
  key: string
  data: string | number | boolean
}

declare global {
  function reportResult(result: ReportableResult): void
}

import type { WorkUnitStore } from '../app-render/work-unit-async-storage.external'
import { Worker } from 'node:worker_threads'

type WorkerResult = {
  exitCode: number
  stderr: string
  consoleCalls: Array<{ method: string; input: string }>
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
    const consoleCalls: Array<{ method: string; input: string }> = []
    const data = {} as Record<string, unknown>
    let stderr = ''

    w.on('message', (m) => {
      messages.push(m)
      switch (m.type) {
        case 'console-call':
          consoleCalls.push({
            method: m.method,
            input: m.input,
          })
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
        consoleCalls,
        data,
        messages,
        stderr,
      })
    )
  })
}

describe('console-exit patches', () => {
  describe('basic functionality', () => {
    it('should wrap existing console methods to exit workUnit storage', async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        // First, replace console.log to track what storage context it runs in
        console.log = function (...args) {
          const store = workUnitAsyncStorage.getStore()
          reportResult({
            type: 'console-call',
            method: 'log',
            input: `${store ? '[Store]' : '[No Store]'}: ${args.join(' ')}`,
          })
        }

        // Install patches - this wraps the current console.log
        require('next/dist/server/node-environment-extensions/console-exit')

        // Test outside storage context
        console.log('outside')

        // Test inside storage context - should show [No Store] because wrapping exits storage
        workUnitAsyncStorage.run({ type: 'prerender' } as WorkUnitStore, () => {
          console.log('inside')
        })
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      // Both should show [No Store] because the wrapped console.log exits storage
      expect(consoleCalls).toEqual([
        { method: 'log', input: '[No Store]: outside' },
        { method: 'log', input: '[No Store]: inside' },
      ])
    })

    it('should not wrap console methods assigned after patching', async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        // Install patches first
        require('next/dist/server/node-environment-extensions/console-exit')

        // Assign a new console.log after patching - this will NOT be wrapped
        console.log = function (...args) {
          const store = workUnitAsyncStorage.getStore()
          reportResult({
            type: 'console-call',
            method: 'log',
            input: `${store ? '[Store]' : '[No Store]'}: ${args.join(' ')}`,
          })
        }

        // Test outside storage context
        console.log('outside')

        // Test inside storage context - should show [Store] because new assignment is not wrapped
        workUnitAsyncStorage.run({ type: 'prerender' } as WorkUnitStore, () => {
          console.log('inside')
        })
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      // New assignments after patching are NOT wrapped, so they preserve storage context
      expect(consoleCalls).toEqual([
        { method: 'log', input: '[No Store]: outside' },
        { method: 'log', input: '[Store]: inside' },
      ])
    })

    it('should preserve function properties and behavior', async () => {
      async function testForWorker() {
        reportResult({
          type: 'serialized',
          key: 'originalName',
          data: JSON.stringify(console.log.name),
        })

        reportResult({
          type: 'serialized',
          key: 'originalLength',
          data: JSON.stringify(console.log.length),
        })

        // install patch
        require('next/dist/server/node-environment-extensions/console-exit')

        // Test that patched methods preserve name and other properties
        reportResult({
          type: 'serialized',
          key: 'patchedName',
          data: JSON.stringify(console.log.name),
        })

        reportResult({
          type: 'serialized',
          key: 'patchedLength',
          data: JSON.stringify(console.log.length),
        })
      }

      const { data, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(data.patchedName).toBe('log')
      expect(data.patchedName).toBe(data.originalName)
      expect(data.patchedLength).toBe(data.originalLength)
    })
  })

  describe('multiple console methods', () => {
    it(`should patch the log method`, async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        console.log = function (...args: Array<any>) {
          const store = workUnitAsyncStorage.getStore()
          reportResult({
            type: 'console-call',
            method: 'log',
            input: `${store ? '[Store]' : '[No Store]'}: ${args.join(' ')}`,
          })
        }

        require('next/dist/server/node-environment-extensions/console-exit')

        workUnitAsyncStorage.run({ type: 'request' } as WorkUnitStore, () => {
          console.log('inside')
        })
        console.log('outside')
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(consoleCalls).toEqual([
        { method: 'log', input: `[No Store]: inside` },
        { method: 'log', input: `[No Store]: outside` },
      ])
    })

    it(`should patch the error method`, async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        console.error = function (...args: Array<any>) {
          const store = workUnitAsyncStorage.getStore()
          reportResult({
            type: 'console-call',
            method: 'error',
            input: `${store ? '[Store]' : '[No Store]'}: ${args.join(' ')}`,
          })
        }

        require('next/dist/server/node-environment-extensions/console-exit')

        workUnitAsyncStorage.run({ type: 'request' } as WorkUnitStore, () => {
          console.error('inside')
        })
        console.error('outside')
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(consoleCalls).toEqual([
        { method: 'error', input: `[No Store]: inside` },
        { method: 'error', input: `[No Store]: outside` },
      ])
    })

    it(`should patch the warn method`, async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        console.warn = function (...args: Array<any>) {
          const store = workUnitAsyncStorage.getStore()
          reportResult({
            type: 'console-call',
            method: 'warn',
            input: `${store ? '[Store]' : '[No Store]'}: ${args.join(' ')}`,
          })
        }

        require('next/dist/server/node-environment-extensions/console-exit')

        workUnitAsyncStorage.run({ type: 'request' } as WorkUnitStore, () => {
          console.warn('inside')
        })
        console.warn('outside')
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(consoleCalls).toEqual([
        { method: 'warn', input: `[No Store]: inside` },
        { method: 'warn', input: `[No Store]: outside` },
      ])
    })

    it(`should patch the info method`, async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        console.info = function (...args: Array<any>) {
          const store = workUnitAsyncStorage.getStore()
          reportResult({
            type: 'console-call',
            method: 'info',
            input: `${store ? '[Store]' : '[No Store]'}: ${args.join(' ')}`,
          })
        }

        require('next/dist/server/node-environment-extensions/console-exit')

        workUnitAsyncStorage.run({ type: 'request' } as WorkUnitStore, () => {
          console.info('inside')
        })
        console.info('outside')
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(consoleCalls).toEqual([
        { method: 'info', input: `[No Store]: inside` },
        { method: 'info', input: `[No Store]: outside` },
      ])
    })

    it(`should patch the debug method`, async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        console.debug = function (...args: Array<any>) {
          const store = workUnitAsyncStorage.getStore()
          reportResult({
            type: 'console-call',
            method: 'debug',
            input: `${store ? '[Store]' : '[No Store]'}: ${args.join(' ')}`,
          })
        }

        require('next/dist/server/node-environment-extensions/console-exit')

        workUnitAsyncStorage.run({ type: 'request' } as WorkUnitStore, () => {
          console.debug('inside')
        })
        console.debug('outside')
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(consoleCalls).toEqual([
        { method: 'debug', input: `[No Store]: inside` },
        { method: 'debug', input: `[No Store]: outside` },
      ])
    })

    it(`should patch the trace method`, async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        console.trace = function (...args: Array<any>) {
          const store = workUnitAsyncStorage.getStore()
          reportResult({
            type: 'console-call',
            method: 'trace',
            input: `${store ? '[Store]' : '[No Store]'}: ${args.join(' ')}`,
          })
        }

        require('next/dist/server/node-environment-extensions/console-exit')

        workUnitAsyncStorage.run({ type: 'request' } as WorkUnitStore, () => {
          console.trace('inside')
        })
        console.trace('outside')
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(consoleCalls).toEqual([
        { method: 'trace', input: `[No Store]: inside` },
        { method: 'trace', input: `[No Store]: outside` },
      ])
    })

    it(`should patch the dir method`, async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        console.dir = function (...args: Array<any>) {
          const store = workUnitAsyncStorage.getStore()
          reportResult({
            type: 'console-call',
            method: 'dir',
            input: `${store ? '[Store]' : '[No Store]'}: ${args.join(' ')}`,
          })
        }

        require('next/dist/server/node-environment-extensions/console-exit')

        workUnitAsyncStorage.run({ type: 'request' } as WorkUnitStore, () => {
          console.dir('inside')
        })
        console.dir('outside')
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(consoleCalls).toEqual([
        { method: 'dir', input: `[No Store]: inside` },
        { method: 'dir', input: `[No Store]: outside` },
      ])
    })

    it(`should patch the dirxml method`, async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        console.dirxml = function (...args: Array<any>) {
          const store = workUnitAsyncStorage.getStore()
          reportResult({
            type: 'console-call',
            method: 'dirxml',
            input: `${store ? '[Store]' : '[No Store]'}: ${args.join(' ')}`,
          })
        }

        require('next/dist/server/node-environment-extensions/console-exit')

        workUnitAsyncStorage.run({ type: 'request' } as WorkUnitStore, () => {
          console.dirxml('inside')
        })
        console.dirxml('outside')
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(consoleCalls).toEqual([
        { method: 'dirxml', input: `[No Store]: inside` },
        { method: 'dirxml', input: `[No Store]: outside` },
      ])
    })

    it(`should patch the table method`, async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        console.table = function (...args: Array<any>) {
          const store = workUnitAsyncStorage.getStore()
          reportResult({
            type: 'console-call',
            method: 'table',
            input: `${store ? '[Store]' : '[No Store]'}: ${args.join(' ')}`,
          })
        }

        require('next/dist/server/node-environment-extensions/console-exit')

        workUnitAsyncStorage.run({ type: 'request' } as WorkUnitStore, () => {
          console.table('inside')
        })
        console.table('outside')
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(consoleCalls).toEqual([
        { method: 'table', input: `[No Store]: inside` },
        { method: 'table', input: `[No Store]: outside` },
      ])
    })

    it(`should patch the assert method`, async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        console.assert = function (...args: Array<any>) {
          const store = workUnitAsyncStorage.getStore()
          reportResult({
            type: 'console-call',
            method: 'assert',
            input: `${store ? '[Store]' : '[No Store]'}: ${args.join(' ')}`,
          })
        }

        require('next/dist/server/node-environment-extensions/console-exit')

        workUnitAsyncStorage.run({ type: 'request' } as WorkUnitStore, () => {
          console.assert('inside')
        })
        console.assert('outside')
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(consoleCalls).toEqual([
        { method: 'assert', input: `[No Store]: inside` },
        { method: 'assert', input: `[No Store]: outside` },
      ])
    })

    it(`should patch the group method`, async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        console.group = function (...args: Array<any>) {
          const store = workUnitAsyncStorage.getStore()
          reportResult({
            type: 'console-call',
            method: 'group',
            input: `${store ? '[Store]' : '[No Store]'}: ${args.join(' ')}`,
          })
        }

        require('next/dist/server/node-environment-extensions/console-exit')

        workUnitAsyncStorage.run({ type: 'request' } as WorkUnitStore, () => {
          console.group('inside')
        })
        console.group('outside')
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(consoleCalls).toEqual([
        { method: 'group', input: `[No Store]: inside` },
        { method: 'group', input: `[No Store]: outside` },
      ])
    })

    it(`should patch the groupCollapsed method`, async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        console.groupCollapsed = function (...args: Array<any>) {
          const store = workUnitAsyncStorage.getStore()
          reportResult({
            type: 'console-call',
            method: 'groupCollapsed',
            input: `${store ? '[Store]' : '[No Store]'}: ${args.join(' ')}`,
          })
        }

        require('next/dist/server/node-environment-extensions/console-exit')

        workUnitAsyncStorage.run({ type: 'request' } as WorkUnitStore, () => {
          console.groupCollapsed('inside')
        })
        console.groupCollapsed('outside')
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(consoleCalls).toEqual([
        { method: 'groupCollapsed', input: `[No Store]: inside` },
        { method: 'groupCollapsed', input: `[No Store]: outside` },
      ])
    })

    it(`should patch the groupEnd method`, async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        console.groupEnd = function () {
          const store = workUnitAsyncStorage.getStore()
          reportResult({
            type: 'console-call',
            method: 'groupEnd',
            input: `${store ? '[Store]' : '[No Store]'}`,
          })
        }

        require('next/dist/server/node-environment-extensions/console-exit')

        workUnitAsyncStorage.run({ type: 'request' } as WorkUnitStore, () => {
          console.groupEnd()
        })
        console.groupEnd()
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(consoleCalls).toEqual([
        { method: 'groupEnd', input: `[No Store]` },
        { method: 'groupEnd', input: `[No Store]` },
      ])
    })

    it('should not wrap arbitrary function property assignments', async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        // Assign an arbitrary function property that shouldn't be wrapped
        // @ts-expect-error - intentionally assigning a custom property
        console.customFunc = function customFunc(...args: Array<any>) {
          const store = workUnitAsyncStorage.getStore()
          reportResult({
            type: 'console-call',
            method: 'customFunc',
            input: `${store ? '[Store]' : '[No Store]'}: ${args.join(' ')}`,
          })
        }

        require('next/dist/server/node-environment-extensions/console-exit')

        workUnitAsyncStorage.run({ type: 'request' } as WorkUnitStore, () => {
          // @ts-expect-error - calling our custom property
          console.customFunc('inside')
        })

        // @ts-expect-error - calling our custom property
        console.customFunc('outside')
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      // The custom function should NOT be wrapped, so it should execute WITH store context
      expect(consoleCalls).toEqual([
        { method: 'customFunc', input: `[Store]: inside` },
        { method: 'customFunc', input: `[No Store]: outside` },
      ])
    })
  })
})
