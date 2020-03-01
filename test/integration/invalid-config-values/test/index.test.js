/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')
const nextConfigPath = join(appDir, 'next.config.js')
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const cleanUp = () => fs.remove(nextConfigPath)

describe('Handles valid/invalid assetPrefix', () => {
  beforeAll(() => cleanUp())
  afterAll(() => cleanUp())

  it('should not error without usage of assetPrefix', async () => {
    await fs.writeFile(
      nextConfigPath,
      `module.exports = {
      }`
    )

    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    expect(stderr).not.toMatch(/Specified assetPrefix is not a string/)
  })

  it('should not error when assetPrefix is a string', async () => {
    await fs.writeFile(
      nextConfigPath,
      `module.exports = {
        assetPrefix: '/hello'
      }`
    )

    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    expect(stderr).not.toMatch(/Specified assetPrefix is not a string/)
  })

  it('should error on wrong usage of assetPrefix', async () => {
    await fs.writeFile(
      nextConfigPath,
      `module.exports = {
        assetPrefix: null
      }`
    )

    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    expect(stderr).toMatch(/Specified assetPrefix is not a string/)
  })

  it('should error on usage of assetPrefix with undefined as value', async () => {
    await fs.writeFile(
      nextConfigPath,
      `module.exports = {
        assetPrefix: undefined
      }`
    )

    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    expect(stderr).toMatch(/Specified assetPrefix is not a string/)
  })
})
