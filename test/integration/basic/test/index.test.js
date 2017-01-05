/* global jasmine, describe, beforeAll, afterAll */

import { nextServer, findPort } from 'next-test-utils'
import fetch from 'node-fetch'
import { join } from 'path'

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

  rendering(context, 'Rendering via API', renderingViaAPI)
  rendering(context, 'Rendering via HTTP', renderingViaHTTP)
  xPoweredBy(context)
  misc(context)
  clientNavigation(context)
})

function renderingViaAPI (pathname, query = {}) {
  return context.app.renderToHTML({}, {}, pathname, query)
}

function renderingViaHTTP (pathname, query = {}) {
  const url = `http://localhost:${context.appPort}${pathname}`
  return fetch(url).then((res) => res.text())
}
