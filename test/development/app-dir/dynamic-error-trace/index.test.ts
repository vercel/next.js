import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  shouldRunTurboDevTest,
  getRedboxSource,
} from 'next-test-utils'

describe('app dir - dynamic error trace', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    dependencies: {
      swr: 'latest',
    },
    packageJson: {
      scripts: {
        build: 'next build',
        dev: `next ${shouldRunTurboDevTest() ? 'dev --turbo' : 'dev'}`,
        start: 'next start',
      },
    },
    installCommand: 'pnpm install',
    startCommand: (global as any).isNextDev ? 'pnpm dev' : 'pnpm start',
    buildCommand: 'pnpm build',
    skipDeployment: true,
  })
  if (skipped) return

  it('should show the error trace', async () => {
    const browser = await next.browser('/')

    await assertHasRedbox(browser)

    await expect(
      browser.hasElementByCssSelector(
        '[data-nextjs-data-runtime-error-collapsed-action]'
      )
    ).resolves.toEqual(false)

    const stackFrameElements = await browser.elementsByCss(
      '[data-nextjs-call-stack-frame]'
    )
    const stackFrames = await Promise.all(
      stackFrameElements.map((f) => f.innerText())
    )
    expect(stackFrames).toEqual([])

    const source = await getRedboxSource(browser)
    // eslint-disable-next-line jest/no-standalone-expect -- this is a test
    expect(source).toContain('app/lib.js (4:13) @ useHeaders')
    expect(source).toContain(`useHeaders()`)
  })
})
