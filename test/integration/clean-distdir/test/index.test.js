/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const customFile = join(appDir, '.next/extra-file.txt')
const cacheDir = join(appDir, '.next/cache')
const nextConfig = join(appDir, 'next.config.js')

let nextConfigContent

async function checkFileWrite(existsAfterBuild) {
  await nextBuild(appDir)
  fs.writeFileSync(customFile, 'this is a testing file')
  await nextBuild(appDir)
  expect(fs.existsSync(customFile)).toBe(existsAfterBuild)
  // `.next/cache` should be preserved in all cases
  expect(fs.existsSync(cacheDir)).toBe(true)
}

const runTests = () => {
  it('should clean up .next before build start', async () => {
    await checkFileWrite(false)
  })
}

describe('Cleaning distDir', () => {
  describe('server mode', () => {
    runTests()
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      nextConfigContent = await fs.readFile(nextConfig, 'utf8')
      await fs.writeFile(
        nextConfig,
        `
        module.exports = {
          target: 'serverless'
        }
      `
      )
    })
    afterAll(async () => {
      await fs.writeFile(nextConfig, nextConfigContent)
    })

    runTests()
  })

  describe('disabled write', () => {
    beforeAll(async () => {
      nextConfigContent = await fs.readFile(nextConfig, 'utf8')
      await fs.writeFile(
        nextConfig,
        `
        module.exports = {
          cleanDistDir: false
        }
      `
      )
    })
    afterAll(async () => {
      await fs.writeFile(nextConfig, nextConfigContent)
    })

    it('should not clean up .next before build start', async () => {
      await checkFileWrite(true)
    })
  })
})
