/* eslint-env jest */

import path from 'path'
import fs from 'fs-extra'
import {
  killApp,
  findPort,
  launchApp,
  nextBuild,
  waitFor,
} from 'next-test-utils'

const dir = path.join(__dirname, '..')
const nextConfig = path.join(dir, 'next.config.js')
const pagesIndex = path.join(dir, 'pages', 'index.js')
const msg =
  'The `app` directory is experimental. To enable, add `appDir: true` to your `next.config.js` configuration under `experimental`. See https://nextjs.org/docs/messages/experimental-app-dir-config'

function runTests(justPutIt: () => Promise<string>) {
  it('should print error when missing config with app', async () => {
    const output = await justPutIt()
    expect(output).toMatch(`Error: > ${msg}`)
  })
  it('should print warning when missing config with app and pages', async () => {
    await fs.outputFile(pagesIndex, 'module.exports = "index"')
    const output = await justPutIt()
    expect(output).toMatch(`warn  - ${msg}`)
  })
  it('should not print when config found with app', async () => {
    await fs.writeFile(
      nextConfig,
      'module.exports = {experimental:{appDir: true}}'
    )
    const output = await justPutIt()
    expect(output).not.toMatch(`Error: > ${msg}`)
    expect(output).not.toMatch(`warn  - ${msg}`)
  })
  it('should not print when config found with app and pages', async () => {
    await fs.outputFile(pagesIndex, 'module.exports = "index"')
    await fs.writeFile(
      nextConfig,
      'module.exports = {experimental:{appDir: true}}'
    )
    const output = await justPutIt()
    expect(output).not.toMatch(`Error: > ${msg}`)
    expect(output).not.toMatch(`warn  - ${msg}`)
  })
}

describe('Error when app dir is present without experimental.appDir', () => {
  describe('next dev', () => {
    const justPutIt = async () => {
      let app
      try {
        const appPort = await findPort()
        let output = ''
        app = await launchApp(dir, appPort, {
          onStdout(data: string) {
            output += data
          },
          onStderr(data: string) {
            output += data
          },
        })
        await waitFor(200)
        return output
      } finally {
        if (app?.pid) killApp(app)
        await fs.remove(nextConfig)
        await fs.remove(path.join(dir, 'pages'))
      }
    }
    runTests(justPutIt)
  })

  describe('next build', () => {
    const justPutIt = async () => {
      let app
      try {
        app = await nextBuild(dir, [], {
          stdout: true,
          stderr: true,
          env: { NEXT_SKIP_APP_REACT_INSTALL: '1' },
        })
        return app.stdout + app.stderr
      } finally {
        if (app?.pid) killApp(app)
        await fs.remove(nextConfig)
        await fs.remove(path.join(dir, 'pages'))
      }
    }
    runTests(justPutIt)
  })
})
