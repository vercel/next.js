/* eslint-env jest */
import fs from 'fs-extra'
import path from 'path'
import { runYarn, usingTempDir, pack } from '../../../lib/npm-utils'

const appDir = path.join(__dirname, '..', 'app')

jest.setTimeout(1000 * 60 * 5)

describe('webpack 5 support', () => {
  it('should build with webpack 5', async () => {
    await usingTempDir(async (tempDir) => {
      const nextTarballPath = await pack(tempDir, 'next')

      const tempAppDir = path.join(tempDir, 'app')
      await fs.copy(appDir, tempAppDir)

      await runYarn(tempAppDir, 'add', nextTarballPath)
      await runYarn(tempAppDir, 'install')

      const { stdout, stderr } = await runYarn(tempAppDir, 'run', 'build')
      console.log(stdout, stderr)
      expect(stdout).toMatch(/Compiled successfully/)
    })
  })
})
