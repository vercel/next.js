/* global jasmine, describe, beforeAll, afterAll */

import { join } from 'path'
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp
} from 'next-test-utils'

// test suits
import rendering from './rendering'
import clientNavigation from './client-navigation'
import hmr from './hmr'
import errorRecovery from './error-recovery'
import dynamic from './dynamic'
import asset from './asset'

const context = {}
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Basic Features', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort)

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(context.appPort, '/async-props'),
      renderViaHTTP(context.appPort, '/default-head'),
      renderViaHTTP(context.appPort, '/empty-get-initial-props'),
      renderViaHTTP(context.appPort, '/error'),
      renderViaHTTP(context.appPort, '/finish-response'),
      renderViaHTTP(context.appPort, '/head'),
      renderViaHTTP(context.appPort, '/json'),
      renderViaHTTP(context.appPort, '/link'),
      renderViaHTTP(context.appPort, '/stateless'),
      renderViaHTTP(context.appPort, '/fragment-syntax'),
      renderViaHTTP(context.appPort, '/custom-extension'),
      renderViaHTTP(context.appPort, '/styled-jsx'),
      renderViaHTTP(context.appPort, '/with-cdm'),
      renderViaHTTP(context.appPort, '/url-prop'),
      renderViaHTTP(context.appPort, '/url-prop-override'),

      renderViaHTTP(context.appPort, '/nav'),
      renderViaHTTP(context.appPort, '/nav/about'),
      renderViaHTTP(context.appPort, '/nav/on-click'),
      renderViaHTTP(context.appPort, '/nav/querystring'),
      renderViaHTTP(context.appPort, '/nav/self-reload'),
      renderViaHTTP(context.appPort, '/nav/hash-changes'),
      renderViaHTTP(context.appPort, '/nav/shallow-routing'),
      renderViaHTTP(context.appPort, '/nav/redirect'),
      renderViaHTTP(context.appPort, '/nav/as-path'),
      renderViaHTTP(context.appPort, '/nav/as-path-using-router'),
      renderViaHTTP(context.appPort, '/nav/url-prop-change'),

      renderViaHTTP(context.appPort, '/nested-cdm/index'),

      renderViaHTTP(context.appPort, '/hmr/about'),
      renderViaHTTP(context.appPort, '/hmr/style'),
      renderViaHTTP(context.appPort, '/hmr/contact'),
      renderViaHTTP(context.appPort, '/hmr/counter')
    ])
  })
  afterAll(() => killApp(context.server))

  rendering(context, 'Rendering via HTTP', (p, q) => renderViaHTTP(context.appPort, p, q), (p, q) => fetchViaHTTP(context.appPort, p, q))
  clientNavigation(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  dynamic(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  hmr(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  errorRecovery(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  asset(context)
})
