import { join } from 'path'
import {
  launchApp,
  renderViaHTTP,
  killApp,
  findPort,
  nextBuild,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../custom-next-config')

describe('ESLint', () => {
  it('should show messages in dev mode as specified in next config', async () => {
    let stdout

    const appPort = await findPort()
    const app = await launchApp(appDir, appPort, {
      onStdout(msg) {
        stdout += msg || ''
      },
    })
    await renderViaHTTP(appPort, '/')
    await killApp(app)
    expect(stdout).toContain('pages/index.js')
    expect(stdout).toContain(
      "8:9  Warning: A synchronous script tag can impact your webpage's performance  @next/next/no-sync-scripts"
    )
    expect(stdout).toContain(
      '9:9  Warning: In order to use external stylesheets use @import in the root stylesheet compiled with NextJS. This ensures proper priority to CSS when loading a webpage.  @next/next/no-css-tags'
    )
    expect(stdout).toContain(
      '9:9  Warning: Stylesheet does not have an associated preload tag. This could potentially impact First paint.  @next/next/missing-preload'
    )
  })

  it('should not show messages in build mode as specified in next config', async () => {
    const { code, stdout } = await nextBuild(appDir, [], {
      stdout: true,
    })
    expect(code).toBe(0)
    expect(stdout).not.toContain('pages/index.js')
    expect(stdout).not.toContain(
      "8:9  Warning: A synchronous script tag can impact your webpage's performance  @next/next/no-sync-scripts"
    )
    expect(stdout).not.toContain(
      '9:9  Warning: In order to use external stylesheets use @import in the root stylesheet compiled with NextJS. This ensures proper priority to CSS when loading a webpage.  @next/next/no-css-tags'
    )
    expect(stdout).not.toContain(
      '9:9  Warning: Stylesheet does not have an associated preload tag. This could potentially impact First paint.  @next/next/missing-preload'
    )
    expect(stdout).toContain('Compiled successfully')
  })
})
