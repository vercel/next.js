import { findPort, killApp, nextBuild, nextStart } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')
let appPort
let app
let browser

const runTests = () => {
  it('Should allow an image with a static src to omit height and width', async () => {
    expect(await browser.elementById('basic-static')).toBeTruthy()
  })
  it('Should automatically provide an image height and width', async () => {
    expect(
      await browser.elementById('basic-static').getAttribute('height')
    ).toBe('300')
    expect(
      await browser.elementById('basic-static').getAttribute('width')
    ).toBe('400')
  })
  it('Should not provide image height and width for layout fill images', async () => {
    expect(
      await browser.elementById('fill-static').getAttribute('height')
    ).toBe(undefined)
    expect(await browser.elementById('fill-static').getAttribute('width')).toBe(
      undefined
    )
  })
}

describe('Static Image Component Tests', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
    browser = await webdriver(appPort, '/')
  })
  afterAll(() => killApp(app))
  runTests()
})
