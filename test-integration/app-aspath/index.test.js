/* eslint-env jest */
/* global page */
import { join } from 'path'
import { runNextDev } from 'next-test-utils'
import fsTimeMachine from 'fs-time-machine'
import waitFor from 'wait-for'

let server

describe('App asPath', () => {
  beforeAll(async () => {
    server = await runNextDev(__dirname)
  })
  afterAll(() => server.close())

  it('should not have any changes in asPath after a bundle rebuild', async () => {
    const _appJS = await fsTimeMachine(join(__dirname, './pages/_app.js'))

    await page.goto(server.getURL('/'))
    await expect(page).toMatch('{ "url": { "query": {}, "pathname": "/", "asPath": "/" } }')

    await _appJS.replace('find this', 'replace with this')
    await waitFor(4000)
    await expect(page).toMatch('{ "url": { "query": {}, "pathname": "/", "asPath": "/" } }')

    await _appJS.restore()
  })
})
