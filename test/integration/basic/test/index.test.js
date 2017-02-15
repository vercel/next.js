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

const context = {}
context.app = nextServer({
  dir: join(__dirname, '../'),
  dev: true,
  quiet: true
})

jasmine.DEFAULT_TIMEOUT_INTERVAL = 40000

describe('Basic Features', () => {
  beforeAll(async () => {
    context.server = await startApp(context.app)
    context.appPort = context.server.address().port
  })
  afterAll(() => stopApp(context.server))

  rendering(context, 'Rendering via API', (p, q) => renderViaAPI(context.app, p, q))
  rendering(context, 'Rendering via HTTP', (p, q) => renderViaHTTP(context.appPort, p, q))
  xPoweredBy(context)
  misc(context)
  clientNavigation(context)
})
