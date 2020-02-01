/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import {
  nextBuild,
  findPort,
  nextStart,
  killApp,
  renderViaHTTP,
} from 'next-test-utils'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')
const nextConfigPath = join(appDir, 'next.config.js')
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const cleanUp = () => fs.remove(nextConfigPath)

describe('Serverless runtime configs', () => {
  beforeAll(() => cleanUp())
  afterAll(() => cleanUp())

  it('should not error on usage of publicRuntimeConfig', async () => {
    await fs.writeFile(
      nextConfigPath,
      `module.exports = {
      target: 'serverless',
      publicRuntimeConfig: {
        hello: 'world'
      }
    }`
    )

    const { stderr, code } = await nextBuild(appDir, undefined, {
      stderr: true,
    })
    expect(code).toBe(0)
    expect(stderr).not.toMatch(
      /Cannot use publicRuntimeConfig or serverRuntimeConfig/
    )
  })

  it('should not error on usage of serverRuntimeConfig', async () => {
    await fs.writeFile(
      nextConfigPath,
      `module.exports = {
      target: 'serverless',
      serverRuntimeConfig: {
        hello: 'world'
      }
    }`
    )

    const { stderr, code } = await nextBuild(appDir, undefined, {
      stderr: true,
    })
    expect(code).toBe(0)
    expect(stderr).not.toMatch(
      /Cannot use publicRuntimeConfig or serverRuntimeConfig/
    )
  })

  it('should support runtime configs in serverless mode', async () => {
    await fs.writeFile(
      nextConfigPath,
      `module.exports = {
        target: 'serverless',
        serverRuntimeConfig: {
          hello: 'world'
        },
        publicRuntimeConfig: {
          another: 'thing'
        }
      }`
    )

    await nextBuild(appDir, [], { stderr: true, stdout: true })
    const appPort = await findPort()
    const app = await nextStart(appDir, appPort, {
      onStdout: console.log,
      onStderr: console.log,
    })

    const browser = await webdriver(appPort, '/config')

    const clientHTML = await browser.eval(`document.documentElement.innerHTML`)
    const ssrHTML = await renderViaHTTP(appPort, '/config')

    await killApp(app)
    await fs.remove(nextConfigPath)

    const ssr$ = cheerio.load(ssrHTML)
    const client$ = cheerio.load(clientHTML)

    const ssrConfig = ssr$('#config').text()
    const clientConfig = client$('#config').text()

    expect(JSON.parse(ssrConfig)).toEqual({
      publicRuntimeConfig: {
        another: 'thing',
      },
      serverRuntimeConfig: {
        hello: 'world',
      },
    })
    expect(JSON.parse(clientConfig)).toEqual({
      publicRuntimeConfig: {
        another: 'thing',
      },
      serverRuntimeConfig: {},
    })
  })
})
