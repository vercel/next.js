/* global jasmine, describe, beforeAll, afterAll */

import next from '../../../dist/server/next'

// test suits
import xPoweredBy from './xpowered-by'
import rendering from './rendering'

const app = next({
  dir: './examples/basic',
  dev: true,
  staticMarkup: true,
  quiet: true
})

jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000

describe('Basic Features', () => {
  beforeAll(() => app.prepare())
  afterAll(() => app.close())

  rendering(app)
  xPoweredBy(app)
})
