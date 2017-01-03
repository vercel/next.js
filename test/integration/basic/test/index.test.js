/* global jasmine, describe, beforeAll, afterAll */

import next from '../../../../dist/server/next'
import fetch from 'node-fetch'
import portFinder from 'portfinder'
import { join } from 'path'

// test suits
import xPoweredBy from './xpowered-by'
import rendering from './rendering'
import misc from './misc'

const app = next({
  dir: join(__dirname, '../'),
  dev: true,
  quiet: true
})

let appPort
jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000

describe('Basic Features', () => {
  beforeAll(async () => {
    await app.prepare()
    appPort = await findPort()
    await app.start(appPort)
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
  const url = `http://localhost:${appPort}${pathname}`
  return fetch(url).then((res) => res.text())
}

function findPort () {
  return new Promise((resolve, reject) => {
    portFinder.getPort((err, port) => {
      if (err) return reject(err)
      return resolve(port)
    })
  })
}
