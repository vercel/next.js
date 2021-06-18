/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild, findPort, launchApp, killApp } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../app')
const tsFile = join(appDir, 'node_modules/typescript/index.js')

describe('Minimum TypeScript Warning', () => {
  it('should show warning during next build with old version', async () => {
    const res = await nextBuild(appDir, [], {
      stderr: true,
      stdout: true,
    })
    expect(res.stdout + res.stderr).toContain(
      'Minimum recommended TypeScript version is'
    )
  })

  it('should show warning during next dev with old version', async () => {
    let output = ''

    const handleOutput = (msg) => {
      output += msg
    }
    const app = await launchApp(appDir, await findPort(), {
      onStdout: handleOutput,
      onStderr: handleOutput,
    })
    await killApp(app)

    expect(output).toContain('Minimum recommended TypeScript version is')
  })

  it('should not show warning during next build with new version', async () => {
    const content = await fs.readFile(tsFile, 'utf8')
    await fs.writeFile(tsFile, content.replace('3.8.3', '4.3.4'))
    const res = await nextBuild(appDir, [], {
      stderr: true,
      stdout: true,
    })
    await fs.writeFile(tsFile, content)

    expect(res.stdout + res.stderr).not.toContain(
      'Minimum recommended TypeScript version is'
    )
  })

  it('should not show warning during next dev with new version', async () => {
    let output = ''

    const handleOutput = (msg) => {
      output += msg
    }
    const content = await fs.readFile(tsFile, 'utf8')
    await fs.writeFile(tsFile, content.replace('3.8.3', '4.3.4'))
    const app = await launchApp(appDir, await findPort(), {
      onStdout: handleOutput,
      onStderr: handleOutput,
    })
    await fs.writeFile(tsFile, content)
    await killApp(app)

    expect(output).not.toContain('Minimum recommended TypeScript version is')
  })
})
