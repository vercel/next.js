import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')

// Skip webpack specific test in Turbopack
;(process.env.TURBOPACK ? describe.skip : describe)(
  'webpack config with extensionAlias setting',
  () => {
    it('should run correctly with an tsx file import with .js extension', async () => {
      const { code } = await nextBuild(appDir, [], {})

      expect(code).toBe(0)
    })
  }
)
