import { isNextDev, nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'
import {
  getRedboxCallStack,
  getRedboxDescription,
  openRedbox,
  retry,
  shouldUseTurbopack,
  toggleCollapseCallStackFrames,
} from 'next-test-utils'

// This fixture intentionally fails prerendering. It checks local build output
// and the development overlay, neither of which is available in deploy mode.
// @force-gate !deploy
describe('dependency-error-stack', () => {
  const workerModes =
    isNextDev && shouldUseTurbopack() ? [false, true] : [false]

  describe.each(workerModes)('validation worker: %s', (devValidationWorker) => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      env: { TEST_VALIDATION_WORKER: String(devValidationWorker) },
      dependencies: {
        'external-time': 'file:./packages/external-time',
        'bundled-time': 'file:./packages/bundled-time',
      },
    })

    beforeAll(async () => {
      if (isNextDev) {
        await next.start()
      }
    })

    if (isNextDev) {
      it.each(['external', 'bundled'])(
        'retains %s dependency frames in the expanded validation stack',
        async (kind) => {
          const browser = await next.browser(`/${kind}`)
          await openRedbox(browser)
          expect(await getRedboxDescription(browser)).toContain('new Date()')

          const collapsed = ((await getRedboxCallStack(browser)) ?? []).join(
            '\n'
          )
          expect(collapsed).toContain('Page')
          expect(collapsed).not.toContain(`${kind}-time/index.js`)

          await toggleCollapseCallStackFrames(browser)
          await retry(async () => {
            const expanded = ((await getRedboxCallStack(browser)) ?? [])
              .join('\n')
              .replace(/\\/g, '/')
            expect(expanded).toMatch(
              new RegExp(`readCurrentTime .*${kind}-time/index\\.js \\(2:10\\)`)
            )
            expect(expanded).toMatch(
              new RegExp(`BlockingWidget .*${kind}-time/index\\.js`)
            )
            expect(expanded).not.toContain('createSyncIOErrorImpl')
          })
        }
      )
    } else {
      it('shows dependency frames with --debug-prerender while hiding framework frames', async () => {
        const normal = await next.build()
        expect(normal.exitCode).toBe(1)
        const normalFrames = stripAnsi(normal.cliOutput)
          .replace(/\\/g, '/')
          .split('\n')
          .filter((line) => /^\s+at /.test(line))
          .join('\n')
        expect(normalFrames).not.toMatch(/(?:external|bundled)-time\/index\.js/)

        const debug = await next.build({ args: ['--debug-prerender'] })
        expect(debug.exitCode).toBe(1)
        const debugFrames = stripAnsi(debug.cliOutput)
          .replace(/\\/g, '/')
          .split('\n')
          .filter((line) => /^\s+at /.test(line))
          .join('\n')
        for (const kind of ['external', 'bundled']) {
          expect(debugFrames).toMatch(
            new RegExp(`readCurrentTime .*${kind}-time/index\\.js:2:10`)
          )
          expect(debugFrames).toMatch(
            new RegExp(`BlockingWidget .*${kind}-time/index\\.js`)
          )
        }
        expect(debugFrames).not.toContain('createSyncIOErrorImpl')
        expect(debugFrames).not.toContain('react_stack_bottom_frame')
        expect(debugFrames).not.toContain('node:internal/')
      })
    }
  })
})
