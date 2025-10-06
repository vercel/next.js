/* eslint-env jest */

import { isNextStart, nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, getRedboxSource } from 'next-test-utils'

describe('CSS Import from node_modules', () => {
  const { next, skipped, isTurbopack, isRspack } = nextTestSetup({
    files: __dirname,
    skipStart: isNextStart,
    skipDeployment: true,
    dependencies: { sass: '1.54.0' },
  })

  if (skipped) {
    return
  }

  if (isNextStart) {
    it('should fail the build', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).not.toBe(0)
      if (isRspack) {
        expect(cliOutput).toMatch(
          /RspackResolver\(NotFound\(\\?"nprogress\/nprogress.css\\?"\)\)/
        )
      } else {
        expect(cliOutput).toMatch(/Can't resolve '[^']*?nprogress[^']*?'/)
      }
      expect(cliOutput).toMatch(/Build failed|Build error occurred/)
    })
  } else {
    it('should show a build error', async () => {
      const browser = await next.browser('/')

      await assertHasRedbox(browser)
      const errorSource = await getRedboxSource(browser)

      if (isTurbopack) {
        expect(errorSource).toMatchInlineSnapshot(`
         "./styles/global.scss.css (1:9)
         Module not found: Can't resolve 'nprogress/nprogress.css'
         > 1 | @import 'nprogress/nprogress.css';
             |         ^
           2 |

         Import trace:
           Browser:
             ./styles/global.scss.css
             ./pages/_app.js

         https://nextjs.org/docs/messages/module-not-found"
        `)
      } else if (isRspack) {
        expect(errorSource).toMatchInlineSnapshot(`
         "./node_modules/.pnpm/next@file+..+next-repo-9363c99f3d71d8f039ab2f44b0982247ca3f251f6a3cb48f6f97e14bd6290b68_3cf165911481a65b93532bfb8e2c9025/node_modules/next/dist/build/webpack/loaders/css-loader/src/index.js??ruleSet[1].rules[8].oneOf[14].use[1]!./node_modules/.pnpm/next@file+..+next-repo-9363c99f3d71d8f039ab2f44b0982247ca3f251f6a3cb48f6f97e14bd6290b68_3cf165911481a65b93532bfb8e2c9025/node_modules/next/dist/build/webpack/loaders/postcss-loader/src/index.js??ruleSet[1].rules[8].oneOf[14].use[2]!./node_modules/.pnpm/next@file+..+next-repo-9363c99f3d71d8f039ab2f44b0982247ca3f251f6a3cb48f6f97e14bd6290b68_3cf165911481a65b93532bfb8e2c9025/node_modules/next/dist/build/webpack/loaders/resolve-url-loader/index.js??ruleSet[1].rules[8].oneOf[14].use[3]!./node_modules/.pnpm/next@file+..+next-repo-9363c99f3d71d8f039ab2f44b0982247ca3f251f6a3cb48f6f97e14bd6290b68_3cf165911481a65b93532bfb8e2c9025/node_modules/next/dist/compiled/sass-loader/cjs.js??ruleSet[1].rules[8].oneOf[14].use[4]!./styles/global.scss
           × Module build failed:
           ╰─▶   × Error: RspackResolver(NotFound("nprogress/nprogress.css"))"
        `)
      } else {
        expect(errorSource).toMatchInlineSnapshot(`
         "./styles/global.scss
         Module not found: Can't resolve 'nprogress/nprogress.css'

         https://nextjs.org/docs/messages/module-not-found

         Import trace for requested module:
         ./styles/global.scss
         ./pages/_app.js"
        `)
      }
    })
  }
})
