/* eslint-env jest */
/* global jasmine, browser */
import { join } from 'path'
import {
  nextServer,
  nextBuild,
  startApp,
  stopApp
} from 'next-test-utils'

describe('withRouter', () => {
  const appDir = join(__dirname, '../')
  let server
  let app
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

  beforeAll(async () => {
    await nextBuild(appDir)
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })

    server = await startApp(app)
  })

  afterAll(() => stopApp(server))

  it('allows observation of navigation events using withRouter', async () => {
    const page = await browser.newPage()
    await page.goto(server.getURL('/a'))
    await page.waitFor('#page-a')
    await expect(page).toMatchElement('.active', { text: 'Foo' })
    await expect(page).toClick('button')
    await page.waitFor('#page-b')
    await expect(page).toMatchElement('.active', { text: 'Bar' })
    await page.close()
  })

  it('allows observation of navigation events using top level Router', async () => {
    const page = await browser.newPage()
    await page.goto(server.getURL('/a'))
    await page.waitFor('#page-a')
    await expect(page).toMatchElement('.active-top-level-router', { text: 'Foo' })
    await expect(page).toClick('button')
    await page.waitFor('#page-b')
    await expect(page).toMatchElement('.active-top-level-router', { text: 'Bar' })
    await page.close()
  })

  it('allows observation of navigation events using top level Router deprecated behavior', async () => {
    const page = await browser.newPage()
    await page.goto(server.getURL('/a'))
    await page.waitFor('#page-a')
    await expect(page).toMatchElement('.active-top-level-router-deprecated-behavior', { text: 'Foo' })
    await expect(page).toClick('button')
    await page.waitFor('#page-b')
    await expect(page).toMatchElement('.active-top-level-router-deprecated-behavior', { text: 'Bar' })
    await page.close()
  })
})
