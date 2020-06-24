/* eslint-env jest */

import { check, findPort, killApp, launchApp } from 'next-test-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { join } from 'path'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')

describe('devtool set in developmemt mode in next config', () => {
  it('should warn when a devtool is set in development mode', async () => {
    let stderr = ''

    const appPort = await findPort()
    const app = await launchApp(join(__dirname, '..'), appPort, {
      env: { __NEXT_TEST_WITH_DEVTOOL: true },
      onStderr(msg) {
        stderr += msg || ''
      },
    })

    const found = await check(
      () => stderr,
      /Reverting webpack devtool to /,
      false
    )

    await killApp(app)
    expect(found).toBeTruthy()
  })

  // TODO: update test to check the error overlay correctly resolves source
  // frames, which is a more robust test
  it('should revert to the original devtool when user set in development mode', async () => {
    const appPort = await findPort()
    const app = await launchApp(join(__dirname, '..'), appPort, {
      env: { __NEXT_TEST_WITH_DEVTOOL: true },
    })
    const browserFiles = await recursiveReadDir(
      join(appDir, '.next', 'static'),
      /.*/
    )
    const jsFiles = browserFiles.filter(
      (file) => file.endsWith('.js') && file.includes('/pages/')
    )

    jsFiles.forEach((file) => {
      expect(browserFiles.includes(`${file}.map`)).toBe(false)
    })

    await killApp(app)
  })
})
