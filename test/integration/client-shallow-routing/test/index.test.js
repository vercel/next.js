/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
  check,
  waitFor,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
let app
let appPort

const runTests = () => {
  it('should not shallowly navigate back in history when current page was not shallow', async () => {
    const browser = await webdriver(appPort, '/first')

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.params).toEqual({ slug: 'first' })

    await browser.elementByCss('#add-query-shallow').click()
    await waitFor(1000)

    const props2 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props2).toEqual(props)

    await browser.elementByCss('#remove-query-shallow').click()
    await waitFor(1000)

    const props3 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props3).toEqual(props)

    await browser.elementByCss('#to-another').click()
    await waitFor(1000)

    await check(() => browser.elementByCss('#props').text(), /another/)

    const props4 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props4.params).toEqual({ slug: 'another' })
    expect(props4.random).not.toBe(props.random)

    await browser.back()
    await waitFor(1000)

    const props5 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props5.params).toEqual({ slug: 'first' })
    expect(props5.random).not.toBe(props4.random)
  })

  it('should not shallowly navigate forwards in history when current page was not shallow', async () => {
    const browser = await webdriver(appPort, '/first')

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.params).toEqual({ slug: 'first' })

    await browser.elementByCss('#add-query-shallow').click()
    await waitFor(1000)

    const props2 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props2).toEqual(props)

    await browser.elementByCss('#to-another').click()
    await waitFor(1000)

    const props3 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props3.params).toEqual({ slug: 'another' })
    expect(props3.random).not.toBe(props2.random)

    await browser.back()
    await waitFor(1000)

    const props4 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props4.params).toEqual({ slug: 'first' })
    expect(props4.random).not.toBe(props3.random)

    await browser.forward()
    await waitFor(1000)

    const props5 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props5.params).toEqual({ slug: 'another' })
    expect(props5.random).not.toBe(props4.random)
  })
}

describe('Client Shallow Routing', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
