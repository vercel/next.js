import { createNextDescribe } from 'e2e-utils'
import { promises as fs } from 'fs'
import { join } from 'path'

createNextDescribe(
  'app dir - rsc client entry',
  {
    files: __dirname,
  },
  ({ next, isNextDev, isTurbopack }) => {
    if (!isNextDev && !isTurbopack) {
      it('should not include client modules that are not imported in the client bundle', async () => {
        const files = await fs.readdir(
          join(next.testDir, '.next', 'static', 'chunks', 'app')
        )
        const pageFile = files.find((file) => file.startsWith('page-'))
        const pageBundle = await next.readFile(
          join('.next', 'static', 'chunks', 'app', pageFile)
        )

        expect(pageBundle).not.toContain(
          'secret internal do not use otherwise you will be fired'
        )
      })
    } else {
      // Noop test
      it('should ', () => {})
    }
  }
)
