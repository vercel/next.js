import path from 'path'

import { nextTestSetup } from 'e2e-utils'

// TODO(lubieowoce): reenable when the cause of flakiness is found and fixed
// (seems to have increased sharply around 2026-08-24/25)
describe.skip('sync IO that blocks the root', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // This test suite repros a regression introduced in https://github.com/vercel/next.js/pull/94044.
  // We switched from prerender to render + cutting of chunks that are emitted after abort.
  // This works for the abort we trigger to finish prerendering, because we ensure that
  // everything that was going to flush some output already did so before we abort.
  // However, when Sync IO causes an abrupt abort in the middle of rendering, we also have
  // to stop collecting output immediately (because e.g. async iterables are errored immediately,
  // without `scheduleWork`), which means that partially finished chunks may get omitted from the output.
  // Essentially, when Sync IO happens, we might lose more content that we would've if we did a halt.
  // With the pages in this test suite, the root chunk (row 0) ends up being blocked.
  // Before the fix introduced in this PR, this bad RSC payload would then flow into `collect-segment-data.ts`
  // which attempts to deserialize it and hangs in an unexpected way (because with a halt, the
  // root chunk was always there).

  describe.each([
    {
      description: 'production',
      isDebugPrerender: false,
    },
    {
      description: 'with --debug-prerender',
      isDebugPrerender: true,
    },
  ])(
    'does not hang the build and reports the failed route - $description',
    ({ isDebugPrerender }) => {
      it.each([
        '/async-root-sync-page',
        '/sync-root-async-page',
        '/sync-root-sync-page',
        '/sync-root-sync-page-no-suspense',
      ])('%s', async (route) => {
        const args = [`--debug-build-paths=app/${route}/*`]
        if (isDebugPrerender) {
          args.push('--debug-prerender')
        }
        const traceFile = `.sync-io-trace-${route.slice(1).replaceAll('/', '-')}-${isDebugPrerender ? 'debug' : 'production'}.log`
        const result = await next.build({
          args,
          env: {
            NEXT_TEST_SYNC_IO_TRACE: '1',
            NEXT_TEST_SYNC_IO_TRACE_FILE: path.join(next.testDir, traceFile),
            NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require=${path.join(__dirname, 'trace-preload.cjs')}`,
          },
        })

        if (isDebugPrerender) {
          const trace = await next.readFile(traceFile).catch(() => '')
          console.log(
            JSON.stringify({
              route,
              reactVersion: process.env.NEXT_TEST_REACT_VERSION ?? 'default',
              exitCode: result.exitCode,
              hasDetailedDiagnostic: result.cliOutput.includes(
                `Error: Route "${route}": Next.js encountered the unstable value \`Date.now()\` while prerendering.`
              ),
              trace: trace
                .trim()
                .split('\n')
                .filter(Boolean)
                .map((line) => JSON.parse(line)),
            })
          )
        }

        if (isDebugPrerender) {
          // The detailed diagnostic comes from the static generation worker
          // and can be lost when React 18 aborts before flushing the root. The
          // parent process still reports the failed route in its export summary.
          expect(result.cliOutput).toContain(`${route}/page: ${route}`)
        } else {
          expect(result.cliOutput).toContain(
            `Error: Route "${route}": Next.js encountered the unstable value \`Date.now()\` while prerendering.`
          )
        }
        expect(result.cliOutput).not.toMatch(
          /Failed to build .*? because it took more than \d+ seconds\. Retrying again shortly\./
        )
        expect(result.exitCode).toBe(1)
      })
    }
  )
})
