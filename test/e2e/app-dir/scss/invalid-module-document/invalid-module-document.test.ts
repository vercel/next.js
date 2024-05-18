/* eslint-env jest */

import { remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'
// In order for the global isNextStart to be set
import 'e2e-utils'

describe('Invalid SCSS in _document', () => {
  ;(Boolean((global as any).isNextStart) ? describe : describe.skip)(
    'production only',
    () => {
      const appDir = __dirname

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })

      it('should fail to build', async () => {
        const { code, stderr } = await nextBuild(appDir, [], {
          stderr: true,
        })
        expect(code).not.toBe(0)
        expect(stderr).toContain('Failed to compile')
        expect(stderr).toContain('styles.module.scss')
        expect(stderr).toMatch(
          /CSS.*cannot.*be imported within.*pages[\\/]_document\.js/
        )
        expect(stderr).toMatch(/Location:.*pages[\\/]_document\.js/)
      })
    }
  )
})
