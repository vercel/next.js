import path from 'path'
import { createNextDescribe, FileRef } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

createNextDescribe(
  'app-dir - data fetching with cache logging',
  {
    skipDeployment: true,
    files: {
      'app/default-cache/page.js': new FileRef(
        path.join(__dirname, 'app/default-cache/page.js')
      ),
    },
  },
  ({ next }) => {
    it('should not log fetching hits in dev mode by default', async () => {
      await next.fetch('/default-cache')

      const logs = stripAnsi(next.cliOutput)
      expect(logs).not.toContain('GET /default-cache 200')
    })
  }
)
