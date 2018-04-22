/* global jasmine, describe, beforeAll, afterAll, it, expect */
import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp
} from 'next-test-utils'

const context = {}

jasmine.DEFAULT_TIMEOUT_INTERVAL = 40000

describe('On Demand Entries', () => {
  it('should pass', () => {})
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort)
  })
  afterAll(() => killApp(context.server))
  it('should compile pages for JSON page requests', async () => {
    const pageContent = await renderViaHTTP(context.appPort, '/_next/-/pages/about.js')
    expect(pageContent.includes('About Page')).toBeTruthy()
  })
})
