/* eslint-env jest */

import { join } from 'path'
import {
  nextBuild,
  launchApp,
  findPort,
  killApp,
  waitFor,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')

describe('Empty configuration', () => {
  it('should show relevant warning and compile successfully for next build', async () => {
    const { stderr, stdout } = await nextBuild(appDir, [], {
      stderr: true,
      stdout: true,
    })
    expect(stdout).toMatch(/Compiled successfully/)
    expect(stderr).toMatch(
      /Detected next\.config\.js, no exported configuration found\. https:\/\/err\.sh\/vercel\/next\.js\/empty-configuration/
    )
  })

  it('should show relevant warning and compile successfully for next dev', async () => {
    let stderr = ''

    const appPort = await findPort()
    const app = await launchApp(appDir, appPort, {
      onStderr(msg) {
        stderr += msg || ''
      },
    })
    await waitFor(1000)
    await killApp(app)

    expect(stderr).toMatch(
      /Detected next\.config\.js, no exported configuration found\. https:\/\/err\.sh\/vercel\/next\.js\/empty-configuration/
    )
  })
})
