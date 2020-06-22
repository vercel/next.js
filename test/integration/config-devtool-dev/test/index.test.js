/* eslint-env jest */

import { join } from 'path'
import { launchApp, findPort, killApp, waitFor } from 'next-test-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')

describe('devtool set in developmemt mode in next config', () => {
  it('should warn when a devtool is set in development mode', async () => {
    let stderr = ''

    const appPort = await findPort()
    const app = await launchApp(join(__dirname, '..'), appPort, {
      onStderr(msg) {
        stderr += msg || ''
      },
    })
    await waitFor(1000)
    await killApp(app)

    expect(stderr).toMatch(/Reverting webpack devtool to /)
  })

  it('should revert to the original devtool when user set in development mode', async () => {
    const appPort = await findPort()
    const app = await launchApp(join(__dirname, '..'), appPort)
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
