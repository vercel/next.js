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

const context = {}
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Babel', () => {
  beforeAll(async () => {
    context.server = await runNextDev(join(__dirname, '..'))
    context.appPort = context.server.port

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(context.appPort, '/')
    ])
  })
  afterAll(() => context.server.close())

  rendering(context, 'Rendering via HTTP', (p, q) => renderViaHTTP(context.appPort, p, q), (p, q) => fetchViaHTTP(context.appPort, p, q))
})
