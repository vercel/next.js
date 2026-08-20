import path from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('app-dir missing root layout', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: {
      app: new FileRef(path.join(__dirname, 'app')),
      'next.config.js': new FileRef(path.join(__dirname, 'next.config.js')),
    },
    skipDeployment: true,
    skipStart: true,
  })

  if (skipped) return

  it('reports a compiler error without modifying the app', async () => {
    if (isNextDev) {
      await next.start()

      const response = await next.fetch('/route')
      expect(response.status).toBe(500)

      await retry(async () => {
        expect(stripAnsi(next.cliOutput)).toContain(
          "route/page.js doesn't have a root layout. To fix this error, make sure every page has a root layout."
        )
      })
    } else {
      await expect(next.start()).rejects.toThrow('next build failed')
      expect(stripAnsi(next.cliOutput)).toContain(
        "route/page.js doesn't have a root layout. To fix this error, make sure every page has a root layout."
      )
    }

    expect(await next.hasFile('app/layout.js')).toBe(false)
  })
})
