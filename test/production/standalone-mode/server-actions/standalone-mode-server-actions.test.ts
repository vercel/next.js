import { ChildProcess } from 'child_process'
import { nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import { findPort, initNextServerScript, killApp } from 'next-test-utils'
import { join } from 'path'
import webdriver from 'next-webdriver'

describe('standalone mode: server actions', () => {
  let server: ChildProcess
  let appPort: number

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    await next.build()

    await fs.move(
      join(next.testDir, '.next/standalone'),
      join(next.testDir, 'standalone')
    )

    await fs.copy(
      join(next.testDir, 'public'),
      join(next.testDir, 'standalone/public')
    )

    await fs.copy(
      join(next.testDir, '.next/static'),
      join(next.testDir, 'standalone/.next/static')
    )

    for (const file of await fs.readdir(next.testDir)) {
      if (file !== 'standalone') {
        await fs.remove(join(next.testDir, file))
        console.log('removed', file)
      }
    }

    const testServer = join(next.testDir, 'standalone/server.js')
    appPort = await findPort()
    server = await initNextServerScript(testServer, /- Local:/, {
      ...process.env,
      ...next.env,
      HOSTNAME: '::',
      PORT: '' + appPort,
    })
  })

  afterAll(async () => {
    if (server) {
      await killApp(server)
    }
  })

  it('should be able to execute server actions', async () => {
    const browser = await webdriver(appPort, `/world`)
    await browser.elementByCss('button').click()

    expect(await browser.elementByCss('#result').text()).toBe('hello world')
  })

  it('should be able to execute MPA server actions', async () => {
    const browser = await webdriver(appPort, `/world`, {
      disableJavaScript: true,
    })

    await browser.elementByCss('button').click()

    expect(await browser.elementByCss('#result').text()).toBe('hello world')
  })
})
