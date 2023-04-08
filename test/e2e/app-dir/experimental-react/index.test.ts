import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - experimental react',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextDev }) => {
    it('should use experimental react with the experimentalReact option', async () => {
      const html = await next.render('/')
      expect(html).toMatch(/-experimental-\w+-\w+/)
    })
  }
)
