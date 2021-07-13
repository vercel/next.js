/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import { findPort, killApp, nextBuild, nextStart } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '..')

let appPort
let app

describe('GS(S)P with file extension', () => {
  beforeAll(async () => {
    const { code } = await nextBuild(appDir)
    if (code !== 0) throw new Error(`build failed with code ${code}`)

    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should support slug with different extensions', async () => {
    const baseDir = join(appDir, '.next/server/pages')
    const fileNames = ['1', '2.ext', '3.html']
    fileNames.forEach((name) => {
      const filePath = join(baseDir, name)
      expect(fs.existsSync(filePath + '.html')).toBe(true)
      expect(fs.existsSync(filePath + '.json')).toBe(true)
    })
  })
})
