/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')

describe('Export with default loader next/image component', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should error during next build', async () => {
      await fs.remove(join(appDir, '.next'))
      await fs.remove(join(appDir, 'out'))
      const { code, stderr } = await nextBuild(appDir, [], { stderr: true })
      expect(stderr).toContain(
        'Image Optimization using the default loader is not compatible with export.'
      )
      expect(code).toBe(1)
    })
  })
})
