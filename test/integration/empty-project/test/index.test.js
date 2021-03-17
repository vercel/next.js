/* eslint-env jest */

import { join } from 'path'
import fs from 'fs'
import { fetchViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

const context = {}
jest.setTimeout(1000 * 60 * 5)

describe('Empty Project', () => {
  beforeAll(async () => {
    fs.unlinkSync(join(__dirname, '..', 'pages', '.gitkeep'))
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort)
  })

  const fetch = (p, q) => fetchViaHTTP(context.appPort, p, q, { timeout: 5000 })

  it('Should not time out and return 404', async () => {
    const res = await fetch('/')
    expect(res.status).toBe(404)
  })

  afterAll(() => {
    killApp(context.server)
    fs.closeSync(fs.openSync(join(__dirname, '..', 'pages', '.gitkeep'), 'w'))
  })
})
