/* eslint-env jest */
/* global browser */
import { join } from 'path'
import fsTimeMachine from 'fs-time-machine'
import { runNextDev, waitFor } from 'next-test-utils'

let server

describe('App asPath', () => {
  beforeAll(async () => {
    server = await runNextDev(join(__dirname, '..'))
  })
  afterAll(() => server.close())

  it('should not have any changes in asPath after a bundle rebuild', async () => {
    const page = await browser.newPage()
    const _appJS = await fsTimeMachine(join(__dirname, '../pages/_app.js'))

    await page.goto(server.getURL('/'))
    await expect(page).toMatch('{ "url": { "query": {}, "pathname": "/", "asPath": "/" } }')

    await _appJS.replace('find this', 'replace with this')
    await waitFor(4000)
    await expect(page).toMatch('{ "url": { "query": {}, "pathname": "/", "asPath": "/" } }')

    await _appJS.restore()
    await page.close()
  })
})
