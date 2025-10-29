import { FileRef, nextTestSetup } from 'e2e-utils'
import {
  findPort,
  getFullUrl,
  initNextServerScript,
  killApp,
  retry,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import path, { join } from 'node:path'
import fs from 'fs-extra'
import os from 'os'

describe('app-dir action body finalize with nodejs middleware and output-standalone', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles: {
      'middleware.js': new FileRef(join(__dirname, 'middleware-node.js')),
    },
    skipStart: true,
  })

  let server: any
  let appPort: number
  let tmpFolder: string

  beforeAll(async () => {
    await next.patchFile('next.config.js', (content) =>
      content.replace('// output', 'output')
    )
    await next.build()
    await next.patchFile(
      '.next/standalone/node_modules/next/dist/server/body-streams.js',
      (content) =>
        content.replace(
          'async finalize () {',
          'async finalize () { \nawait new Promise((resolve) => setTimeout(resolve, (Math.random() * 1000) + 1000));\n'
        )
    )

    tmpFolder = path.join(os.tmpdir(), 'next-standalone-' + Date.now())
    await fs.mkdirp(tmpFolder)
    const distFolder = path.join(tmpFolder, 'test')
    await fs.move(path.join(next.testDir, '.next/standalone'), distFolder)
    await fs.move(
      path.join(next.testDir, '.next/static'),
      path.join(distFolder, '.next/static')
    )

    const testServer = path.join(distFolder, 'server.js')
    appPort = await findPort()
    server = await initNextServerScript(
      testServer,
      /- Local:/,
      {
        ...process.env,
        PORT: appPort.toString(),
      },
      undefined,
      {
        cwd: distFolder,
      }
    )
  })

  afterAll(async () => {
    if (server) await killApp(server)
    if (!process.env.NEXT_TEST_SKIP_CLEANUP) {
      await fs.remove(tmpFolder)
    }
  })

  it('should handle large payload through server action after nodejs middleware with delayed body finalize', async () => {
    const browser = await webdriver(getFullUrl(appPort, '/body-finalize'), '')

    try {
      await browser.elementById('submit-large').click()
      await retry(async () => {
        const resultText = await browser.elementById('result').text()
        const result = JSON.parse(resultText)

        expect(result.success).toBe(true)
        expect(result.count).toBe(10 * 1024)
        expect(result.firstId).toBe(0)
        expect(result.lastId).toBe(10 * 1024 - 1)
      })
    } finally {
      await browser.close()
    }
  })
})
