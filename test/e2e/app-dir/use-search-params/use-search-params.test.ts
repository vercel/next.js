import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'use-search-params',
  { files: __dirname },
  ({ next, isNextStart }) => {
    if (!isNextStart) {
      it('skip test for dev mode', () => {})
      return
    }
    it('should fail build if useSearchParams is used without suspense boundaries', async () => {
      await next.patchFile(
        'app/layout.js',
        `
        import React from 'react'

        export default function Layout({ children }) {
          return (
            <html>
              <head />
              <body>
              {children}
              </body>
            </html>
          )
        }
        
      `
      )
      await next.stop()
      try {
        await next.build()
      } catch {}
      expect(next.cliOutput).toContain(
        '`useSearchParams()` at page "/" needs to be wrapped in a suspense boundary'
      )
    })
  }
)
