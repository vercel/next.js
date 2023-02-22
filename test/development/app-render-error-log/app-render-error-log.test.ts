import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'app-render-error-log',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should log the correct values on app-render error', async () => {
      const outputIndex = next.cliOutput.length
      await next.fetch('/')

      await check(() => next.cliOutput.slice(outputIndex), /at Page/)
      const cliOutput = next.cliOutput.slice(outputIndex)

      expect(cliOutput).toInclude('Error: boom')
      expect(cliOutput).toInclude('at fn2 (./app/fn.ts:6:11)')
      expect(cliOutput).toInclude('at fn1 (./app/fn.ts:9:5')
      expect(cliOutput).toInclude('at Page (./app/page.tsx:10:45)')
      expect(cliOutput).toInclude('digest: ')

      expect(cliOutput).not.toInclude('webpack-internal')
    })

    it('should log the correct values on app-render error with edge runtime', async () => {
      const outputIndex = next.cliOutput.length
      await next.fetch('/edge')

      await check(() => next.cliOutput.slice(outputIndex), /at EdgePage/)
      const cliOutput = next.cliOutput.slice(outputIndex)

      expect(cliOutput).toInclude('Error: boom')
      expect(cliOutput).toInclude('at fn2 (./app/fn.ts:6:11)')
      expect(cliOutput).toInclude('at fn1 (./app/fn.ts:9:5')
      expect(cliOutput).toInclude('at EdgePage (./app/edge/page.tsx:12:45)')
      expect(cliOutput).toInclude('digest: ')

      expect(cliOutput).not.toInclude('webpack-internal')
    })
  }
)
