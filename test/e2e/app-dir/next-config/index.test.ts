import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - next config',
  {
    files: __dirname,
  },
  ({ next }) => {
    // https://github.com/vercel/next.js/issues/52366
    it('should support importing webpack in next.config', async () => {
      const html = await next.render('/')
      expect(html).toContain('hello from page')
    })
  }
)
