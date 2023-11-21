/* eslint-env jest */

import fsp from 'fs/promises'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')

describe('Export index page with `notFound: true` in `getStaticProps`', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should build successfully', async () => {
      await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
      await fsp.rm(join(appDir, 'out'), { recursive: true, force: true })
      const { code } = await nextBuild(appDir)
      expect(code).toBe(0)
    })
  })
})
