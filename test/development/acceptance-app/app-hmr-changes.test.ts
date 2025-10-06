import { FileRef, nextTestSetup } from 'e2e-utils'
import { createSandbox } from 'development-sandbox'
import path from 'path'

jest.setTimeout(240 * 1000)

describe('Error overlay - RSC build errors', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'app-hmr-changes')),
    dependencies: {
      '@next/mdx': 'canary',
      'react-wrap-balancer': '^0.2.4',
      'react-tweet': '^3.2.0',
      '@mdx-js/react': '^2.3.0',
      tailwindcss: '^3.2.6',
      typescript: 'latest',
      '@types/react': '^18.0.28',
      '@types/react-dom': '^18.0.10',
      'image-size': '^1.0.2',
      autoprefixer: '^10.4.13',
    },
  })

  // TODO: The error overlay is not closed when restoring the working code.
  ;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
    'Skipped in webpack',
    () => {
      it('should handle successive HMR changes with errors correctly', async () => {
        await using sandbox = await createSandbox(
          next,
          undefined,
          '/2020/develop-preview-test'
        )
        const { session } = sandbox
        expect(
          await session.evaluate('document.documentElement.innerHTML')
        ).toContain('A few years ago I tweeted')

        const pagePath = 'app/(post)/2020/develop-preview-test/page.mdx'
        const originalPage = await next.readFile(pagePath)

        const break1 = originalPage.replace('break 1', '<Figure>')

        await session.patch(pagePath, break1)

        const break2 = break1.replace('{/* break point 2 */}', '<Figure />')

        await session.patch(pagePath, break2)

        for (let i = 0; i < 5; i++) {
          await session.patch(pagePath, break2.replace('break 3', '<Hello />'))

          await session.patch(pagePath, break2)
          await session.assertHasRedbox()

          await session.patch(pagePath, break1)

          await session.patch(pagePath, originalPage)
          await session.assertNoRedbox()
        }

        expect(
          await session.evaluate('document.documentElement.innerHTML')
        ).toContain('A few years ago I tweeted')
      })
    }
  )
})
