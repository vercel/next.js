import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'turbopack-reports',
  {
    files: __dirname,
    dependencies: {
      sqlite3: '5.1.7',
    },
  },
  ({ next }) => {
    it('should render page importing sqlite3', async () => {
      const $ = await next.render$('/sqlite-import-5913')
      expect($('#message').text()).toBe('Hello World')
    })
  }
)
