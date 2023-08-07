import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'repeated-forward-slashes-error',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should log error when href has repeated forward-slashes', async () => {
      await next.render$('/my/path/name')
      await check(() => next.cliOutput, /Invalid href/)
      expect(next.cliOutput).toContain(
        "Invalid href '/hello//world' passed to next/router in page: '/my/path/[name]'. Repeated forward-slashes (//) or backslashes \\ are not valid in the href."
      )
    })
  }
)
