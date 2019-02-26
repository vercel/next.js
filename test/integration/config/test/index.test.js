/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  renderViaHTTP,
  fetchViaHTTP,
  runNextDev
} from 'next-test-utils'

// test suits
import rendering from './rendering'
import client from './client'

const context = {}
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Configuration', () => {
  beforeAll(async () => {
    context.server = await runNextDev(join(__dirname, '../'))
    context.appPort = context.server.port

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(context.appPort, '/next-config'),
      renderViaHTTP(context.appPort, '/build-id'),
      renderViaHTTP(context.appPort, '/webpack-css'),
      renderViaHTTP(context.appPort, '/module-only-component')
    ])
  })
  afterAll(() => context.server.close())

  rendering(context, 'Rendering via HTTP', (p, q) => renderViaHTTP(context.appPort, p, q), (p, q) => fetchViaHTTP(context.appPort, p, q))
  client(context, (p, q) => renderViaHTTP(context.appPort, p, q))
})
