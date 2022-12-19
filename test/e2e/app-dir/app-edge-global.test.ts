import { createNextDescribe } from 'e2e-utils'
import path from 'path'

createNextDescribe(
  'app-dir global edge configuration',
  {
    files: path.join(__dirname, 'app-edge-global'),
    skipDeployment: true,
  },
  ({ next }) => {
    it('should handle edge only routes', async () => {
      const html = await next.render('/app-edge')
      expect(html).toContain('<p>Edge!</p>')
    })
  }
)
