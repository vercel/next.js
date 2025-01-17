/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import {
  killApp,
  findPort,
  nextBuild,
  nextStart,
  launchApp,
  fetchViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let app

const runTests = () => {
  it('should rewrite correctly for path at same level as fallback: false SSR', async () => {
    const res = await fetchViaHTTP(appPort, '/hello', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    expect($('#another').text()).toBe('another')
    expect(JSON.parse($('#query').text())).toEqual({
      path: ['hello'],
    })
  })

  it('should rewrite correctly for path above fallback: false SSR', async () => {
    const res = await fetchViaHTTP(appPort, '/hello/world', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    expect($('#another').text()).toBe('another')
    expect(JSON.parse($('#query').text())).toEqual({
      path: ['hello', 'world'],
    })
  })

  it('should rewrite correctly for path at same level as fallback: false client', async () => {
    const browser = await webdriver(appPort, '/hello')

    expect(await browser.elementByCss('#another').text()).toBe('another')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      path: ['hello'],
    })
  })

  it('should rewrite correctly for path above fallback: false client', async () => {
    const browser = await webdriver(appPort, '/hello/world')

    expect(await browser.elementByCss('#another').text()).toBe('another')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      path: ['hello', 'world'],
    })
  })

  it('should not rewrite for path from fallback: false SSR', async () => {
    const res = await fetchViaHTTP(appPort, '/first', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    expect($('#slug').text()).toContain('hello')
    expect(JSON.parse($('#query').text())).toEqual({
      slug: 'first',
    })
  })

  it('should not rewrite for path from fallback: false client', async () => {
    const browser = await webdriver(appPort, '/second')

    expect(await browser.elementByCss('#slug').text()).toContain('hello')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      slug: 'second',
    })
  })

  it('should behave properly when accessing the dynamic param directly', async () => {
    const res = await fetchViaHTTP(appPort, '/[slug]', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    expect($('#another').text()).toBe('another')
    expect(JSON.parse($('#query').text())).toEqual({
      path: ['[slug]'],
    })
  })
}

describe('fallback: false rewrite', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        await fs.remove(join(appDir, '.next'))
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await fs.remove(join(appDir, '.next'))
        await nextBuild(appDir, [])
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
    }
  )
})
