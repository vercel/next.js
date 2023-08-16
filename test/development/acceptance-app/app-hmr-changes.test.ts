import { FileRef, nextTestSetup } from 'e2e-utils'
import { check, hasRedbox, waitFor, retry } from 'next-test-utils'
import path from 'path'

describe('Error overlay - RSC build errors', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'app-hmr-changes')),
    dependencies: {
      '@next/mdx': 'canary',
      'react-wrap-balancer': '^0.2.4',
      'next-tweet': '^0.6.0',
      '@mdx-js/react': '^2.3.0',
      tailwindcss: '^3.2.6',
      typescript: 'latest',
      '@types/react': '^18.0.28',
      '@types/react-dom': '^18.0.10',
      'image-size': '^1.0.2',
      autoprefixer: '^10.4.13',
    },
  })

  it('should handle successive HMR changes with errors correctly', async () => {
    const browser = await retry(
      () => next.browser('/2020/develop-preview-test'),
      1000,
      500
    )

    await check(
      () => browser.eval('document.documentElement.innerHTML'),
      /A few years ago I tweeted/
    )

    const pagePath = 'app/(post)/2020/develop-preview-test/page.mdx'
    const originalPage = await next.readFile(pagePath)

    const break1 = originalPage.replace('break 1', '<Figure>')

    await next.patchFile(pagePath, break1)

    const break2 = break1.replace('{/* break point 2 */}', '<Figure />')

    await next.patchFile(pagePath, break2)

    for (let i = 0; i < 5; i++) {
      await next.patchFile(pagePath, break2.replace('break 3', '<Hello />'))

      await next.patchFile(pagePath, break2)
      expect(await hasRedbox(browser, true)).toBe(true)

      await next.patchFile(pagePath, break1)
      await waitFor(100)

      await next.patchFile(pagePath, originalPage)
      expect(await hasRedbox(browser, false)).toBe(false)
    }

    await check(
      () => browser.eval('document.documentElement.innerHTML'),
      /A few years ago I tweeted/
    )
  })
})
