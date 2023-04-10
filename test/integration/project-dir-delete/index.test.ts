import {
  check,
  findPort,
  killApp,
  launchApp,
  renderViaHTTP,
} from 'next-test-utils'
import { join } from 'path'
import fs from 'fs-extra'
import stripAnsi from 'strip-ansi'

describe('Project Directory Delete Handling', () => {
  it('should gracefully exit on project dir delete', async () => {
    const appDir = join(__dirname, 'app')
    const appPort = await findPort()

    await fs.ensureDir(join(appDir, 'pages'))
    await fs.writeFile(
      join(appDir, 'pages', 'index.js'),
      `
      export default function Page() {
        return <p>hello world</p>
      }
    `
    )
    let output = ''

    const app = await launchApp(appDir, appPort, {
      onStdout(msg) {
        output += msg
      },
      onStderr(msg) {
        output += msg
      },
    })

    expect(await renderViaHTTP(appPort, '/')).toContain('hello world')
    await fs.remove(appDir)

    await check(
      () => stripAnsi(output),
      /Project directory could not be found, restart Next\.js in your new directory/
    )

    try {
      await killApp(app)
    } catch (_) {}
  })
})
