/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

let app
let appPort

describe('Document middleware', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(join(__dirname, '../'), appPort)
  })
  afterAll(() => killApp(app))

  it('should render a page without error', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/hi there/i)
  })

  it('should set header in middleware and still render', async () => {
    const res = await fetchViaHTTP(appPort, '/')
    const html = await res.text()
    const header = res.headers.get('next-middleware')

    expect(html).toMatch(/hi there/i)
    expect(header).toBe('hi from middleware')
  })

  it('should set header and abort render on res.end()', async () => {
    const res = await fetchViaHTTP(appPort, '/another')
    const html = await res.text() || ''
    const header = res.headers.get('next-middleware')

    expect(html.length).toBe(0)
    expect(header).toBe('hit another!')
  })
})
