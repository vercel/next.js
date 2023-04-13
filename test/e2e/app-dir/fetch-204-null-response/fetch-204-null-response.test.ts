import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'fetch-204-null-response',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should work when page fetches an API that returns back a 204', async () => {
      const html = await next.render('/')
      expect(html).toContain('ok')
    })
  }
)
