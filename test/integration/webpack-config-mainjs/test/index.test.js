/* eslint-env jest */

import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')

// Skip webpack specific test in Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Customized webpack config with main.js',
  () => {
    it('should run correctly with main.js customized', async () => {
      const { code } = await nextBuild(appDir, [], {})

      expect(code).toBe(0)
    })
  }
)
