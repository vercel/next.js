/* eslint-env jest */

import { remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

describe('SCSS Support loader handling', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    describe('Preprocessor loader order', () => {
      const appDir = __dirname

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      it('should compile successfully', async () => {
        const { stdout } = await nextBuild(appDir, [], {
          stdout: true,
        })
        // eslint-disable-next-line
        expect(stdout).toMatch(/Compiled successfully/)
      })
    })
  })
})
