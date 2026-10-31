/**
 * Testing unhandled rejections in Jest is quite tricky because by default Jest will fail the test
 * if there are any unhandled rejections. This is a unit test and we want to observe rejections with
 * as little manipulation of the runtime as possible. The strategy we take is to run a special
 * function in each test inside a Worker thread. This allows us to have an isolated node environment
 * that won't interfere with anything going on inside the process running Jest. We support a native TS
 * authoring experience by passing the code for the Worker as a string gathered from toString-ing the
 * worker test function.
 *
 * Another place to watch out for is that requiring code in the worker requires targeting next/dist
 * files (javascript only) and you must target from the package root down.
 *
 * @jest-environment node
 */

/* eslint-disable @next/internal/typechecked-require */

type ReportableResult = UHRReport | SerializableDataReport | ErrorReport

type UHRReport = {
  type: 'uhr'
  reason: string
}
type SerializableDataReport = {
  type: 'serialized'
  key: string
  data: string
}
type ErrorReport = { type: 'error'; message: string }

declare global {
  function reportResult(result: ReportableResult): void
}

import { Worker } from 'node:worker_threads'

type WorkerResult = {
  exitCode: number
  stderr: string
  uhr: Array<UHRReport>
  data: Record<string, unknown>
  messages: Array<ReportableResult>
}

function runWorkerCode(fn: Function): Promise<WorkerResult> {
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
    const uhr: Array<UHRReport> = []
    const data = {} as Record<string, unknown>
    let stderr = ''

    w.on('message', (m) => {
      messages.push(m)
      switch (m.type) {
        case 'uhr':
          uhr.push(m.reason)
          break
        case 'serialized':
          data[m.key] = JSON.parse(m.data)
          break
        default:
          break
      }
    })
    w.on('error', reject)
    w.stderr?.on('data', (b) => (stderr += String(b)))
    w.on('exit', (code) =>
      resolve({
        exitCode: code ?? -1,
        uhr,
        data,
        messages,
        stderr,
      })
    )
  })
}

describe('makeHangingPromiseWithError', () => {
  // When a prerender is abandoned, React renders the component a second time to
  // build a component stack for the aborting error. If that second render hits a
  // client hook such as usePathname(), the render signal is already aborted, so
  // makeHangingPromiseWithError() takes the `signal.aborted` branch. Nothing is
  // expected to await that promise, so the rejection it creates must not be
  // reported as unhandled. Next.js can normally suppress such rejections, but
  // only if the AsyncLocalStorage store is visible inside the unhandledRejection
  // handler, which is not guaranteed across runtimes (Bun reports a null store
  // there), so the promise itself has to handle the rejection.
  // https://github.com/vercel/next.js/issues/99575
  it('does not report an unhandled rejection for an already-aborted signal', async () => {
    async function testForWorker() {
      // We deliberately do not install the unhandled rejection filter that
      // Next.js installs, so that we observe the rejection the way a runtime
      // that cannot restore the store in the handler would.
      process.on('unhandledRejection', (reason) => {
        reportResult({ type: 'uhr', reason: String(reason) })
      })

      const {
        ClientHookDynamicError,
        makeClientHookHangingPromise,
      } = require('next/dist/server/dynamic-rendering-utils')

      makeClientHookHangingPromise(
        AbortSignal.abort(),
        new ClientHookDynamicError('/some-route', 'usePathname()')
      )

      // Callers that do await the promise must still observe the rejection.
      let observedMessage: string | null = null
      try {
        await makeClientHookHangingPromise(
          AbortSignal.abort(),
          new ClientHookDynamicError('/some-route', 'useSearchParams()')
        )
      } catch (error) {
        observedMessage = error instanceof Error ? error.message : String(error)
      }

      // Give Node time to detect unhandled rejections.
      await new Promise((r) => setTimeout(r, 20))

      reportResult({
        type: 'serialized',
        key: 'observedMessage',
        data: JSON.stringify(observedMessage),
      })
    }

    const { uhr, exitCode, data } = await runWorkerCode(testForWorker)

    expect(exitCode).toBe(0)
    expect(uhr).toEqual([])
    expect(data.observedMessage).toContain('useSearchParams()')
  })
})
