/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')
const nextConfigPath = join(appDir, 'next.config.js')
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const cleanUp = () => fs.remove(nextConfigPath)

describe('Serverless runtime configs', () => {
  beforeAll(() => cleanUp())
  afterAll(() => cleanUp())

  it('should error on usage of publicRuntimeConfig', async () => {
    await fs.writeFile(
      nextConfigPath,
      `module.exports = {
      target: 'serverless',
      publicRuntimeConfig: {
        hello: 'world'
      }
    }`
    )

    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    expect(stderr).toMatch(
      /Cannot use publicRuntimeConfig or serverRuntimeConfig/
    )
  })

  it('should error on usage of serverRuntimeConfig', async () => {
    await fs.writeFile(
      nextConfigPath,
      `module.exports = {
      target: 'serverless',
      serverRuntimeConfig: {
        hello: 'world'
      }
    }`
    )

    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    expect(stderr).toMatch(
      /Cannot use publicRuntimeConfig or serverRuntimeConfig/
    )
  })
})
