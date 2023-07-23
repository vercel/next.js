import path from 'path'
import { createNextDescribe, FileRef } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

createNextDescribe(
  'app-dir - data fetching with cache logging',
  {
    skipDeployment: true,
    files: {
      'app/layout.js': new FileRef(path.join(__dirname, 'app/layout.js')),
      'app/default-cache/page.js': new FileRef(
        path.join(__dirname, 'app/default-cache/page.js')
      ),
      'next.config.js': `module.exports = { experimental: { logging: 'verbose' } }`,
    },
  },
  ({ next, isNextDev }) => {
    function runTests({ isVerbose }: { isVerbose: boolean }) {
      it('should not log fetching hits in dev mode by default', async () => {
        await next.fetch('/default-cache')

        const logs = stripAnsi(next.cliOutput)
        if (isVerbose && isNextDev) {
          expect(logs).toContain('GET /default-cache 200')
        } else {
          expect(logs).not.toContain('GET /default-cache 200')
        }
      })
    }

    describe('with logging verbose', () => {
      runTests({ isVerbose: true })
    })

    describe('with default logging', () => {
      beforeAll(async () => {
        await next.stop()
        await next.deleteFile('next.config.js')
        await next.start()
      })
      runTests({ isVerbose: false })
    })
  }
)
