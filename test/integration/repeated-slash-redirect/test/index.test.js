/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  launchApp,
  killApp,
  findPort,
  nextBuild,
  nextStart,
  fetchViaHTTP,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

let appDir = join(__dirname, '..')
const nextConfigPath = join(appDir, 'next.config.js')
let nextConfigContent
let appPort
let app

const runTests = (isDev = false) => {
  it.each([
    ['/hello//world', '/hello/world'],
    ['//hello/world', '/hello/world'],
    ['/hello/world//', '/hello/world'],
    ['//', '/'],
    ['/hello///world', '/hello/world'],
    ['/hello///world////foo', '/hello/world/foo'],
    ['/hello//world?foo=bar//baz', '/hello/world?foo=bar%2F%2Fbaz'],
  ])('it should redirect %s to %s', async (from, to) => {
    const res = await fetchViaHTTP(appPort, from, undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(308)
    const location = new URL(res.headers.get('location'), 'http://n')
    const locPathname = location.href.slice(location.origin.length)
    expect(locPathname).toBe(to)
  })
}

describe('Repeated trailing slashes', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests(true)
  })

  describe('server mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir, [], {
        stdout: true,
      })
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests()
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      nextConfigContent = await fs.readFile(nextConfigPath, 'utf8')
      await fs.writeFile(
        nextConfigPath,
        nextConfigContent.replace(/\/\/ target/, 'target'),
        'utf8'
      )
      await nextBuild(appDir, [], {
        stdout: true,
      })
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await fs.writeFile(nextConfigPath, nextConfigContent, 'utf8')
      await killApp(app)
    })

    runTests()
  })
})
