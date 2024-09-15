import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  shouldRunTurboDevTest,
  getRedboxSource,
} from 'next-test-utils'
import { outdent } from 'outdent'

const isReactExperimental = process.env.__NEXT_EXPERIMENTAL_PPR === 'true'

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
    expect(stackFrames).toEqual(isReactExperimental ? ['', ''] : [])

    const codeframe = await getRedboxSource(browser)
    // TODO(NDX-115): column for "^"" marker is inconsistent between native, Webpack, and Turbopack
    expect(codeframe).toEqual(
      process.env.TURBOPACK
        ? outdent`
            app/lib.js (4:12) @ Foo
            
              2 |
              3 | export function Foo() {
            > 4 |   useHeaders()
                |            ^
              5 |   return 'foo'
              6 | }
              7 |
          `
        : // TODO: should be "@ Foo" since that's where we put the codeframe and print the source location
          outdent`
            app/lib.js (4:13) @ useHeaders

              2 |
              3 | export function Foo() {
            > 4 |   useHeaders()
                |             ^
              5 |   return 'foo'
              6 | }
              7 |
          `
    )
  })
})
