/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')
const nextConfigPath = join(appDir, 'next.config.js')

const cleanUp = () => fs.remove(nextConfigPath)

describe('Handles valid/invalid assetPrefix', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
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
    }
  )
})
