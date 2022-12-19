import { createNextDescribe } from 'e2e-utils'
import path from 'path'

createNextDescribe(
  'app-dir global edge configuration',
  {
    files: path.join(__dirname, 'app-edge-global'),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
      typescript: 'latest',
      '@types/react': 'latest',
      '@types/node': 'latest',
    },
    skipDeployment: true,
  },
  ({ next }) => {
    it('should handle edge only routes', async () => {
      const html = await next.render('/app-edge')
      expect(html).toContain('<p>Edge!</p>')
    })
  }
)
