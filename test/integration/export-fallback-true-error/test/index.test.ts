/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')

describe('Export error for fallback: true', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('should build successfully', async () => {
        await fs.remove(join(appDir, '.next'))
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
    }
  )
})
