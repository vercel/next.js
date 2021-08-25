/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  renderViaHTTP,
  nextBuild,
  startApp,
  stopApp,
  nextServer,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '..')

let app
let server

describe('Cannot assign to read only property children', () => {
  beforeEach(() => fs.remove(join(appDir, '.next/')))

  it('Should serve the page', async () => {
    await nextBuild(appDir)
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true,
    })

    server = await startApp(app)
    console.log(server.address().port)
    const html = await renderViaHTTP(server.address().port, '/foo/123')
    expect(html).toContain('hi')
  })

  afterAll(async () => {
    if (server) stopApp(server)
  })
})
