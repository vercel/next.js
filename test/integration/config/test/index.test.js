/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp,
} from 'next-test-utils'
import fetch from 'node-fetch'

// test suits
import rendering from './rendering'
import client from './client'

const context = {}
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Configuration', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort)

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(context.appPort, '/next-config'),
      renderViaHTTP(context.appPort, '/build-id'),
      renderViaHTTP(context.appPort, '/webpack-css'),
      renderViaHTTP(context.appPort, '/module-only-component'),
    ])
  })

  it('should disable X-Powered-By header support', async () => {
    const url = `http://localhost:${context.appPort}/`
    const header = (await fetch(url)).headers.get('X-Powered-By')
    expect(header).not.toBe('Next.js')
  })

  afterAll(() => {
    killApp(context.server)
  })

  rendering(
    context,
    'Rendering via HTTP',
    (p, q) => renderViaHTTP(context.appPort, p, q),
    (p, q) => fetchViaHTTP(context.appPort, p, q)
  )
  client(context, (p, q) => renderViaHTTP(context.appPort, p, q))
})
