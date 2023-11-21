/* eslint-env jest */

import fsp from 'fs/promises'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')

describe('jsconfig.json', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should build normally', async () => {
      const res = await await nextBuild(appDir, [], { stdout: true })
      expect(res.stdout).toMatch(/Compiled successfully/)
    })

    it('should fail on invalid jsconfig.json', async () => {
      const jsconfigPath = join(appDir, 'jsconfig.json')
      const originalJsconfig = await fsp.readFile(jsconfigPath, {
        encoding: 'utf-8',
      })
      await fsp.writeFile(jsconfigPath, '{', {
        encoding: 'utf-8',
      })
      try {
        const res = await nextBuild(appDir, [], { stderr: true })
        expect(res.stderr).toMatch(/Error: Failed to parse "/)
        expect(res.stderr).toMatch(/JSON5: invalid end of input at 1:2/)
      } finally {
        await fsp.writeFile(jsconfigPath, originalJsconfig, {
          encoding: 'utf-8',
        })
      }
    })
  })
})
