import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const customErrNo404Match =
  /You have added a custom \/_error page without a custom \/404 page/

describe('Custom _error', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
    dependencies: {
      react: '19.3.0-canary-fef12a01-20260413',
      'react-dom': '19.3.0-canary-fef12a01-20260413',
    },
    skipDeployment: true,
  })

  if (isNextDev) {
    it('should not warn with /_error and /404 when rendering error first', async () => {
      const outputIndex = next.cliOutput.length
      await next.patchFile('pages/404.js', 'export default <h1>')
      try {
        await retry(async () => {
          const html = await next.render('/404')
          expect(html).toContain("Expected '\\u003c/', got '\\u003ceof\\u003e'")
          expect(next.cliOutput.slice(outputIndex)).not.toMatch(
            customErrNo404Match
          )
        })
      } finally {
        await next.deleteFile('pages/404.js')
      }
    })

    it('should not warn with /_error and /404', async () => {
      const outputIndex = next.cliOutput.length
      await next.patchFile(
        'pages/404.js',
        `export default () => 'not found...'`
      )
      try {
        await retry(async () => {
          const html = await next.render('/404')
          expect(html).toContain('not found...')
          expect(next.cliOutput.slice(outputIndex)).not.toMatch(
            customErrNo404Match
          )
        })
      } finally {
        await next.deleteFile('pages/404.js')
      }
    })

    it('should warn on custom /_error without custom /404', async () => {
      await retry(async () => {
        const html = await next.render('/404')
        expect(next.cliOutput).toMatch(customErrNo404Match)
        expect(html).toContain('An error 404 occurred on server')
      })
    })
  }

  if (isNextStart) {
    it('should not contain /_error in build output', async () => {
      expect(next.cliOutput).toMatch(/ƒ .*?\/404/)
      expect(next.cliOutput).not.toMatch(/ƒ .*?\/_error/)
    })

    it('renders custom _error successfully', async () => {
      const html = await next.render('/')
      expect(html).toMatch(/Custom error/)
    })
  }
})
