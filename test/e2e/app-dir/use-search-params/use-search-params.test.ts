import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'use-search-params',
  { files: __dirname },
  ({ next, isNextStart }) => {
    if (!isNextStart) {
      it('skip test for dev mode', () => {})
      return
    }

    it('should pass build if useSearchParams is used with suspense boundaries', async () => {
      await next.stop()
      await expect(next.build()).resolves.toEqual({ exitCode: 0 })
    })

    it('should fail build if useSearchParams is used without suspense boundaries', async () => {
      await next.patchFile(
        'app/layout.js',
        `import React from 'react'

        export default function Layout({ children }) {
          return (
            <html>
              <head />
              <body>
              {children}
              </body>
            </html>
          )
        }`
      )

      await next.stop()
      await expect(next.build()).resolves.toEqual({
        exitCode: 1,
        cliOutput: expect.stringContaining(
          `\`useSearchParams()\` at page "/" needs to be wrapped in a suspense boundary.`
        ),
      })
    })
  }
)
