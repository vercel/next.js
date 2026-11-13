/* eslint-env jest */
import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup, type Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'
import path from 'path'
import { outdent } from 'outdent'

const bundlerName = process.env.IS_TURBOPACK_TEST
  ? 'Turbopack'
  : process.env.NEXT_RSPACK
    ? 'Rspack'
    : 'Webpack'

describe('Error Overlay version staleness', () => {
  // The fixture's next.config.js mocks the package registry with a newer major
  // version, so the installed version is always reported as outdated.
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'version-staleness')),
    skipStart: true,
  })

  async function expectOutdatedStaleness(browser: Playwright) {
    const { version } = JSON.parse(
      await next.readFile('node_modules/next/package.json')
    )
    // The registry lookup is not awaited before the overlay is shown, so the
    // staleness can arrive after the installed version is already displayed.
    await retry(async () => {
      expect(
        await browser
          .waitForElementByCss('.nextjs-container-build-error-version-status')
          .text()
      ).toBe(`Next.js ${version} (outdated)\n${bundlerName}`)
    })
  }

  it('should show version staleness in runtime error', async () => {
    await using sandbox = await createSandbox(next)
    const { session, browser } = sandbox
    await session.patch(
      'app/page.js',
      outdent`
        "use client"
        import Component from '../index'
        export default function Page() {
          setTimeout(() => {
              throw new Error("runtime error")
          }, 0)
          return null
        }
      `
    )

    await session.openRedbox()

    await expectOutdatedStaleness(browser)
  })

  it('should show version staleness in render error', async () => {
    await using sandbox = await createSandbox(next)
    const { session, browser } = sandbox
    await session.patch(
      'app/page.js',
      outdent`
        export default function Page() {
          throw new Error("render error")
          return null
        }
      `
    )

    await expectOutdatedStaleness(browser)
  })

  it('should show version staleness in build error', async () => {
    await using sandbox = await createSandbox(next)
    const { session, browser } = sandbox
    await session.patch(
      'app/page.js',
      outdent`
        {{{
      `
    )

    await expectOutdatedStaleness(browser)
  })
})
