/* eslint-env jest */

import path from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '..')

describe('Handles Errors During Export', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('Does not crash workers', async () => {
      const { stdout, stderr } = await nextBuild(appDir, [], {
        stdout: true,
        stderr: true,
      })

      expect(stdout + stderr).not.toMatch(/ERR_IPC_CHANNEL_CLOSED/)
      expect(stderr).toContain('Export encountered errors on following paths')
      expect(stderr).toContain('/page')
      expect(stderr).toContain('/page-1')
      expect(stderr).toContain('/page-2')
      expect(stderr).toContain('/page-3')
      expect(stderr).toContain('/page-13')
      expect(stderr).toContain('/blog/[slug]: /blog/first')
      expect(stderr).toContain('/blog/[slug]: /blog/second')
      expect(stderr).toContain('/custom-error')
      expect(stderr).toContain('custom error message')
    })
  })
})
