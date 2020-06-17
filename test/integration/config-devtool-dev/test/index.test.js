/* eslint-env jest */

import { join } from 'path'
import { launchApp, findPort, killApp, waitFor } from 'next-test-utils'

jest.setTimeout(1000 * 30)

describe('devtool set in developmemt mode in next config', () => {
  it('should warn & revert when a devtool is set in development mode', async () => {
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
})
