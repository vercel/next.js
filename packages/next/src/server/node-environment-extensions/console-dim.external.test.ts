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
      execArgv: ['--conditions=react-server'],
      stderr: true,
      stdout: false,
      env: {
        FORCE_COLOR: '1',
      },
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
    it('should patch console methods to dim when instructed', async () => {
      async function testForWorker() {
        const {
          consoleAsyncStorage,
        } = require('next/dist/server/app-render/console-async-storage.external')

        // First, replace console.log to track what storage context it runs in
        console.log = function (...args) {
          let dimmed = false
          if (
            args.find((a) =>
              typeof a === 'string' ? a.includes('color:') : false
            )
          ) {
            dimmed = true
          }
          reportResult({
            type: 'console-call',
            method: 'log',
            input: `${dimmed ? '[DIM]' : '[BRIGHT]'}: ${args.join(' ')}`,
          })
        }

        // Install patches - this wraps the current console.log
        require('next/dist/server/node-environment-extensions/console-dim.external')

        // Test outside storage context
        console.log('outside')

        consoleAsyncStorage.run({ dim: true }, () => {
          console.log('inside')
        })
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      // Both should show [No Store] because the wrapped console.log exits storage
      expect(consoleCalls).toEqual([
        { method: 'log', input: '[BRIGHT]: outside' },
        // can't match the formatting characters easily
        { method: 'log', input: expect.stringMatching(/\[DIM\].*inside/) },
      ])
    })

    it('should not wrap console methods assigned after patching', async () => {
      async function testForWorker() {
        const {
          consoleAsyncStorage,
        } = require('next/dist/server/app-render/console-async-storage.external')

        // Install patches first
        require('next/dist/server/node-environment-extensions/console-dim.external')

        // Assign a new console.log after patching - this will NOT be wrapped
        console.log = function (...args) {
          let dimmed = false
          if (
            args.find((a) =>
              typeof a === 'string' ? a.includes('color:') : false
            )
          ) {
            dimmed = true
          }
          reportResult({
            type: 'console-call',
            method: 'log',
            input: `${dimmed ? '[DIM]' : '[BRIGHT]'}: ${args.join(' ')}`,
          })
        }

        // Test outside storage context
        console.log('outside')

        consoleAsyncStorage.run({ dim: true }, () => {
          console.log('inside')
        })
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      // New assignments after patching are NOT wrapped, so they preserve storage context
      expect(consoleCalls).toEqual([
        { method: 'log', input: '[BRIGHT]: outside' },
        { method: 'log', input: '[BRIGHT]: inside' },
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
        require('next/dist/server/node-environment-extensions/console-dim.external')

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

    it('should enter a dimming context when a prerender store exists with an aborted renderSignal', async () => {
      async function testForWorker() {
        const {
          workUnitAsyncStorage,
        } = require('next/dist/server/app-render/work-unit-async-storage.external')

        // First, replace console.log to track what storage context it runs in
        console.log = function (...args) {
          let dimmed = false
          if (
            args.find((a) =>
              typeof a === 'string' ? a.includes('color:') : false
            )
          ) {
            dimmed = true
          }
          reportResult({
            type: 'console-call',
            method: 'log',
            input: `${dimmed ? '[DIM]' : '[BRIGHT]'}: ${args.join(' ')}`,
          })
        }

        // Install patches - this wraps the current console.log
        require('next/dist/server/node-environment-extensions/console-dim.external')

        // Test outside storage context
        console.log('outside')

        const controller = new AbortController()

        workUnitAsyncStorage.run(
          { type: 'prerender', renderSignal: controller.signal },
          () => {
            console.log('before abort')
            controller.abort()
            console.log('after abort')
          }
        )
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      // Both should show [No Store] because the wrapped console.log exits storage
      expect(consoleCalls).toEqual([
        { method: 'log', input: '[BRIGHT]: outside' },
        { method: 'log', input: '[BRIGHT]: before abort' },
        { method: 'log', input: expect.stringMatching(/\[DIM\].*after abort/) },
      ])
    })

    it('should enter a dimming context when a react cacheSignal exists and is aborted', async () => {
      async function testForWorker() {
        const originalLog = console.log
        let controller: null | AbortController = new AbortController()

        // First, replace console.log to track what storage context it runs in
        console.log = function (...args) {
          originalLog(...args)
          let dimmed = false
          if (
            args.find((a) =>
              typeof a === 'string' ? a.includes('color:') : false
            )
          ) {
            dimmed = true
          }
          reportResult({
            type: 'console-call',
            method: 'log',
            input: `${dimmed ? '[DIM]' : '[BRIGHT]'}: ${args.join(' ')}`,
          })
        }

        // Install patches - this wraps the current console.log
        const {
          registerGetCacheSignal,
        } = require('next/dist/server/node-environment-extensions/console-dim.external')

        registerGetCacheSignal(() => null)
        registerGetCacheSignal(() => controller?.signal)
        registerGetCacheSignal(() => null)

        console.log('before abort')
        controller.abort()
        console.log('after abort')

        controller = null
        console.log('with null signal')
      }

      const { consoleCalls, exitCode } = await runWorkerCode(testForWorker)

      expect(exitCode).toBe(0)
      expect(consoleCalls).toEqual([
        { method: 'log', input: '[BRIGHT]: before abort' },
        { method: 'log', input: expect.stringMatching(/\[DIM\].*after abort/) },
        { method: 'log', input: '[BRIGHT]: with null signal' },
      ])
    })
  })
})
