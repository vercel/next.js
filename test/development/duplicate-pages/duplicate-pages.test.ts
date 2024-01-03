import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'Handles Duplicate Pages',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('Shows warning in development', async () => {
      await next.render('/hello')
      expect(next.cliOutput).toMatch(/Duplicate page detected/)
    })
  }
)
