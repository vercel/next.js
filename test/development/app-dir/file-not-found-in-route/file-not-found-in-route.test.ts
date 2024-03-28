import stripAnsi from 'next/dist/compiled/strip-ansi'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'file-not-found-in-route',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('responds with 500 (Internal Server Error) when file not found error was thrown', async () => {
      const res = await next.fetch('/api')
      expect(res.status).toBe(500)
    })

    it('logs error to console', async () => {
      const outputIndex = next.cliOutput.length
      await next.fetch('/api')
      const output = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(output).toContain(
        "- error Error: ENOENT: no such file or directory, open 'file-does-not-exist.txt'"
      )
    })
  }
)
