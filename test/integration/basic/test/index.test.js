/* global jasmine, describe, beforeAll, afterAll */

import { join } from 'path'
import {
  nextServer,
  renderViaAPI,
  renderViaHTTP,
  startApp,
  stopApp
} from 'next-test-utils'

// test suits
import xPoweredBy from './xpowered-by'
import rendering from './rendering'
import misc from './misc'
import clientNavigation from './client-navigation'
import hmr from './hmr'

const context = {}
context.app = nextServer({
  dir: join(__dirname, '../'),
  dev: true,
  quiet: true
})

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

describe('Basic Features', () => {
  beforeAll(async () => {
    context.server = await startApp(context.app)
    context.appPort = context.server.address().port

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(context.appPort, '/async-props'),
      renderViaHTTP(context.appPort, '/empty-get-initial-props'),
      renderViaHTTP(context.appPort, '/error'),
      renderViaHTTP(context.appPort, '/finish-response'),
      renderViaHTTP(context.appPort, '/head'),
      renderViaHTTP(context.appPort, '/json'),
      renderViaHTTP(context.appPort, '/link'),
      renderViaHTTP(context.appPort, '/stateful'),
      renderViaHTTP(context.appPort, '/stateless'),
      renderViaHTTP(context.appPort, '/styled-jsx'),
      renderViaHTTP(context.appPort, '/with-cdm'),

      renderViaHTTP(context.appPort, '/nav'),
      renderViaHTTP(context.appPort, '/nav/about'),
      renderViaHTTP(context.appPort, '/nav/querystring'),
      renderViaHTTP(context.appPort, '/nav/self-reload'),
      renderViaHTTP(context.appPort, '/nav/hash-changes'),
      renderViaHTTP(context.appPort, '/nav/shallow-routing'),
      renderViaHTTP(context.appPort, '/nav/redirect'),
      renderViaHTTP(context.appPort, '/nav/as-path'),
      renderViaHTTP(context.appPort, '/nav/as-path-using-router'),

      renderViaHTTP(context.appPort, '/nested-cdm/index')
    ])
  })
  afterAll(() => stopApp(context.server))

  rendering(context, 'Rendering via API', (p, q) => renderViaAPI(context.app, p, q))
  rendering(context, 'Rendering via HTTP', (p, q) => renderViaHTTP(context.appPort, p, q))
  xPoweredBy(context)
  misc(context)
  clientNavigation(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  hmr(context, (p, q) => renderViaHTTP(context.appPort, p, q))
})
