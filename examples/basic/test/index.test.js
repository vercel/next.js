/* global jasmine, describe, beforeAll, afterAll */

import next from '../../../dist/server/next'

// test suits
import xPoweredBy from './xpowered-by'
import rendering from './rendering'
import misc from './misc'
import fetch from 'node-fetch'

const app = next({
  dir: './examples/basic',
  dev: true,
  quiet: true
})

jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000

describe('Basic Features', () => {
  beforeAll(async () => {
    await app.prepare()
    await app.start(4004)
  })
  afterAll(() => app.close())

  rendering(app, 'Rendering via API', renderingViaAPI)
  rendering(app, 'Rendering via HTTP', renderingViaHTTP)
  xPoweredBy(app)
  misc(app)
})

function renderingViaAPI (pathname, query = {}) {
  return app.renderToHTML({}, {}, pathname, query)
}

function renderingViaHTTP (pathname, query = {}) {
  const url = `http://localhost:${4004}${pathname}`
  return fetch(url).then((res) => res.text())
}
