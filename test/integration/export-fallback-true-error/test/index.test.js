/* eslint-env jest */

import fsp from 'fs/promises'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')

describe('Export error for fallback: true', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should build successfully', async () => {
      await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
      const { code, stderr } = await nextBuild(appDir, [], {
        stderr: true,
        stdout: true,
      })

      expect(stderr).toContain('Found pages with `fallback` enabled')
      expect(stderr).toContain(
        'Pages with `fallback` enabled in `getStaticPaths` can not be exported'
      )
      expect(stderr).toContain('/[slug]')
      expect(code).toBe(1)
    })
  })
})
