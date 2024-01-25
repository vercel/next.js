import path from 'path'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'externals-app',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should have externals for those in config.experimental.serverComponentsExternalPackages', async () => {
      const $ = await next.render$('/')

      const text = $('#directory').text()
      expect(text).toBe(
        path.join(next.testDir, 'node_modules', 'external-package')
      )
    })

    it('uses externals for predefined list in server-external-packages.json', async () => {
      const $ = await next.render$('/predefined')

      const text = $('#directory').text()
      expect(text).toBe(path.join(next.testDir, 'node_modules', 'sqlite3'))
    })
  }
)
