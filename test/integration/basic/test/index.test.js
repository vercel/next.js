/* global jasmine, describe, beforeAll, afterAll */

import { join } from 'path'
import {
  nextServer,
  findPort,
  renderViaAPI,
  renderViaHTTP
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

jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000

describe('Basic Features', () => {
  beforeAll(async () => {
    await context.app.prepare()
    context.appPort = await findPort()
    await context.app.start(context.appPort)
  })
  afterAll(() => context.app.close())

  rendering(context, 'Rendering via API', (p, q) => renderViaAPI(context.app, p, q))
  rendering(context, 'Rendering via HTTP', (p, q) => renderViaHTTP(context.appPort, p, q))
  xPoweredBy(context)
  misc(context)
  clientNavigation(context)
})
