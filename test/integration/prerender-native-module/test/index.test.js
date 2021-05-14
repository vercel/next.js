/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

let app
let appPort
const appDir = join(__dirname, '..')

const runTests = () => {
  it('should render index correctly', async () => {
    const browser = await webdriver(appPort, '/')
    expect(await browser.elementByCss('#index').text()).toBe('index page')
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      index: true,
    })
  })

  it('should render /blog/first correctly', async () => {
    const browser = await webdriver(appPort, '/blog/first')

    expect(await browser.elementByCss('#blog').text()).toBe('blog page')
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: { slug: 'first' },
      blog: true,
      users: [
        { id: 1, first_name: 'john', last_name: 'deux' },
        { id: 2, first_name: 'zeit', last_name: 'geist' },
      ],
    })
  })

  it('should render /blog/second correctly', async () => {
    const browser = await webdriver(appPort, '/blog/second')
    await browser.waitForElementByCss('#blog')

    expect(await browser.elementByCss('#blog').text()).toBe('blog page')
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: { slug: 'second' },
      blog: true,
      users: [
        { id: 1, first_name: 'john', last_name: 'deux' },
        { id: 2, first_name: 'zeit', last_name: 'geist' },
      ],
    })
  })
}

describe('Prerender native module', () => {
  describe('production', () => {
    beforeAll(async () => {
      const result = await nextBuild(appDir, undefined, {
        cwd: appDir,
        stderr: true,
        stdout: true,
      })

      if (result.code !== 0) {
        console.error(result)
        throw new Error(`Failed to build, exited with code ${result.code}`)
      }
      appPort = await findPort()
      app = await nextStart(appDir, appPort, { cwd: appDir })
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('dev', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, { cwd: appDir })
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
