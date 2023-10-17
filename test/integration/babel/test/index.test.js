/* eslint-env jest */

import { join } from 'path'
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp,
} from 'next-test-utils'

// test suits
import rendering from './rendering'

const context = {}

;(process.env.TURBOPACK ? describe.skip : describe)('Babel', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort)

    // pre-build all pages at the start
    await Promise.all([renderViaHTTP(context.appPort, '/')])
  })
  afterAll(() => killApp(context.server))

  rendering(
    context,
    'Rendering via HTTP',
    (p, q) => renderViaHTTP(context.appPort, p, q),
    (p, q) => fetchViaHTTP(context.appPort, p, q)
  )
})
