import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-render-error-log',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should log the correct values on app-render error ', async () => {
      await next.fetch('/')

      expect(next.cliOutput).toInclude('Error: boom')
      expect(next.cliOutput).toInclude('at fn2 (./app/fn.ts:6:11)')
      expect(next.cliOutput).toInclude('at fn1 (./app/fn.ts:9:5')
      expect(next.cliOutput).toInclude('at Page (./app/page.tsx:10:45)')
      expect(next.cliOutput).toInclude('digest: ')

      expect(next.cliOutput).not.toInclude('webpack-internal')
    })
  }
)
