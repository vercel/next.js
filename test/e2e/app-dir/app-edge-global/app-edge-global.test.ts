import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir global edge configuration',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should handle edge only routes', async () => {
      const html = await next.render('/app-edge')
      expect(html).toContain('<p>Edge!</p>')
    })
  }
)
