import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'custom-app-render',
  {
    files: __dirname,
    skipDeployment: true,
    startCommand: 'node server.js',
    dependencies: {
      'get-port': '5.1.1',
    },
  },
  ({ next }) => {
    it.each(['/', '/render'])('should render %s', async (page) => {
      const $ = await next.render$(page)
      expect($('#page').data('page')).toBe(page)
    })
  }
)
