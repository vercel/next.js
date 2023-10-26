/* eslint-env jest */

import { join } from 'path'
import getPort from 'get-port'
import {
  fetchViaHTTP,
  initNextServerScript,
  killApp,
  getPageFileFromBuildManifest,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let server

const context = {}

const startServer = async (optEnv = {}) => {
  const scriptPath = join(appDir, 'server.js')
  context.appPort = appPort = await getPort()
  const env = Object.assign({ ...process.env }, { PORT: `${appPort}` }, optEnv)

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
    expect(body).toMatch(
      process.env.TURBOPACK ? /turbopack/ : /exportpathmap was here/
    )
  })

  it('should still handle /_next routes', async () => {
    await fetch('/exportpathmap-route') // make sure it's built
    const pageFile = getPageFileFromBuildManifest(
      appDir,
      '/exportpathmap-route'
    )
    const res = await fetch(join('/_next', pageFile))
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toMatch(
      process.env.TURBOPACK ? /turbopack/ : /exportpathmap was here/
    )
  })

  it('should route to public folder files', async () => {
    const res = await fetch('/hello.txt')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toMatch(/hello/)
  })
})
