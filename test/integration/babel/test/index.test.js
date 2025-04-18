/* eslint-env jest */

import { join } from 'path'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

// test suits
import rendering from './rendering'

/** @type {number} */
let appPort
/** @type {import('child_process').ChildProcess} */
let server
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)('Babel', () => {
  beforeAll(async () => {
    appPort = await findPort()
    server = await launchApp(join(__dirname, '../'), appPort)

    // pre-build all pages at the start
    await Promise.all([renderViaHTTP(appPort, '/')])
  })
  afterAll(() => killApp(server))

  rendering('Rendering via HTTP', (p, q) => renderViaHTTP(appPort, p, q))
})
