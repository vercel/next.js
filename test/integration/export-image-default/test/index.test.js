/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild, nextExport } from 'next-test-utils'

const appDir = join(__dirname, '../')
const outdir = join(appDir, 'out')

describe('Export with default loader next/image component', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should build successfully', async () => {
      await fs.remove(join(appDir, '.next'))
      const { code } = await nextBuild(appDir)
      if (code !== 0) throw new Error(`build failed with status ${code}`)
    })

    it('should have error during next export', async () => {
      const { stderr } = await nextExport(appDir, { outdir }, { stderr: true })
      expect(stderr).toContain(
        'Image Optimization using the default loader is not compatible with export.'
      )
    })
  })
})
