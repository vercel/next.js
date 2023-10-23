/* eslint-env jest */

import path from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '..')

describe('Errors on output to static', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('Throws error when export out dir is static', async () => {
      const results = await nextBuild(appDir, [], {
        stdout: true,
        stderr: true,
      })
      expect(results.stdout + results.stderr).toMatch(
        /The 'static' directory is reserved in Next\.js and can not be used as/
      )
    })
  })
})
