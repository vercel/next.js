/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  renderViaHTTP,
  runNextDev
} from 'next-test-utils'

// test suits
import hmr from './hmr'

const context = {}
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Page Extensions', () => {
  beforeAll(async () => {
    context.server = await runNextDev(join(__dirname, '../'))
    context.appPort = context.server.port

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(context.appPort, '/hmr/some-page')
    ])
  })
  afterAll(() => context.server.close())

  hmr(context, (p, q) => renderViaHTTP(context.appPort, p, q))
})
