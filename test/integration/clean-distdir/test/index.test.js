/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')
const nextDir = join(appDir, '.next')
const customFile = join(nextDir, '/extra-file.txt')
const cacheDir = join(nextDir, '/cache')
// const swcCacheDir = join(nextDir, '/cache/swc')
const nextConfig = join(appDir, 'next.config.js')

let nextConfigContent

async function checkFileWrite(existsAfterBuild) {
  await nextBuild(appDir, [])
  fs.writeFileSync(customFile, 'this is a testing file')
  await nextBuild(appDir, [])
  expect(fs.existsSync(customFile)).toBe(existsAfterBuild)
  // `.next/cache` should be preserved in all cases
  expect(fs.existsSync(cacheDir)).toBe(true)
  // expect(fs.existsSync(swcCacheDir)).toBe(true)
}

const runTests = () => {
  it('should clean up .next before build start', async () => {
    await checkFileWrite(false)
  })
}

describe('Cleaning distDir', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(() => {
        fs.removeSync(nextDir)
      })

      runTests()

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
    }
  )
})
