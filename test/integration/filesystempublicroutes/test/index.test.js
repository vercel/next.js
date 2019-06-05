/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import getPort from 'get-port'
import { fetchViaHTTP, initNextServerScript, killApp } from 'next-test-utils'
import clone from 'clone'

const appDir = join(__dirname, '../')
let appPort
let server
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const context = {}

const startServer = async (optEnv = {}) => {
  const scriptPath = join(appDir, 'server.js')
  context.appPort = appPort = await getPort()
  const env = Object.assign(
    {},
    clone(process.env),
    { PORT: `${appPort}` },
    optEnv
  )

  server = await initNextServerScript(scriptPath, /ready on/i, env)
}

describe('FileSystemPublicRoutes', () => {
  beforeAll(() => startServer())
  afterAll(() => killApp(server))

  const fetch = (p, q) => fetchViaHTTP(context.appPort, p, q)

  it('should not route to the index page', async () => {
    const res = await fetch('/')
    expect(res.status).toBe(404)
    const body = await res.text()
    expect(body).toMatch(/404/)
  })

  it('should route to exportPathMap defined routes in development', async () => {
    const res = await fetch('/exportpathmap-route')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toMatch(/exportpathmap was here/)
  })

  it('should still handle /_next routes', async () => {
    await fetch('/exportpathmap-route') // make sure it's built
    const res = await fetch(
      '/_next/static/development/pages/exportpathmap-route.js'
    )
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toMatch(/exportpathmap was here/)
  })
})
