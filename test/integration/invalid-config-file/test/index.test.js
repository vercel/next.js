/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')
const nextConfigPath = join(appDir, 'next.config.js')
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const cleanUp = () => fs.remove(nextConfigPath)

describe('Handles valid/invalid next.config.js', () => {
  beforeAll(() => cleanUp())
  afterAll(() => cleanUp())

  it('should not error when config has an exported object', async () => {
    await fs.writeFile(
      nextConfigPath,
      `module.exports = {
      }`
    )

    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    expect(stderr).not.toMatch(
      /`next.config.js` file found, but nothing was exported from it/
    )
  })

  // it('should not error when config has an exported function', async () => {
  //   await fs.writeFile(
  //     nextConfigPath,
  //     `module.exports = () => {
  //       return {}
  //     }`
  //   )

  //   const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
  //   expect(stderr).not.toMatch(/`next.config.js` file found, but nothing was exported from it/)
  // })

  it('should error when no export is defined', async () => {
    await fs.writeFile(nextConfigPath, `{}`)

    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    expect(stderr).toMatch(
      /`next.config.js` file found, but nothing was exported from it/
    )
  })
})
