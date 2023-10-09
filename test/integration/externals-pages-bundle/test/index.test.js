/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')

describe('bundle pages externals with config.experimental.bundlePagesExternals', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should have no externals with the config set', async () => {
      await nextBuild(appDir, [], { stdout: true })
      const output = await fs.readFile(
        join(appDir, '.next/server/pages/index.js'),
        'utf8'
      )
      expect(output).not.toContain('require("external-package")')
    })
  })
})
