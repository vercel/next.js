/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../app')
const testOutputFilename = join(appDir, 'test-output-page-infos.json')

const clean = () =>
  fs.remove(testOutputFilename).catch((err) => {
    if (err.code === 'ENOENT') return /* pass */
    throw err
  })

const runTests = () => {
  it('should call onBuildComplete', async () => {
    const onBuildCompleteOutput = await fs.readFile(testOutputFilename)
    expect(JSON.parse(onBuildCompleteOutput)).toBeTruthy()
  })
}

describe('onBuildComplete in next.config.js', () => {
  describe('production build', () => {
    beforeAll(async () => {
      await clean()
      await nextBuild(appDir, [], { stdout: true })
    })
    afterAll(clean)

    runTests()
  })
})
