/* eslint-env jest */

import { join } from 'path'
import { launchApp, nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const expectedErr =
  /Webpack config is undefined. You may have forgot to return properly from within the "webpack" method of your next.config.js/

describe('undefined webpack config error', () => {
  it('should show in production mode', async () => {
    const result = await nextBuild(appDir, [], {
      stdout: true,
      stderr: true,
    })
    expect(result.stderr || '' + result.stdout || '').toMatch(expectedErr)
  })

  it('should show in dev mode', async () => {
    let output = ''

    await launchApp(appDir, [], {
      onStderr(msg) {
        output += msg || ''
      },
      ontStdout(msg) {
        output += msg || ''
      },
    })

    expect(output).toMatch(expectedErr)
  })
})
