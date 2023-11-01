import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'use-search-params',
  {
    files: __dirname,
  },
  ({ next, isNextStart }) => {
    it('should fail build if useSearchParams is used without suspense boundaries', async () => {
      if (!isNextStart) {
        it('skip test for dev mode', () => {})
        return
      }
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
        'Entire page / deopted into client-side rendering.'
      )
    })
  }
)
