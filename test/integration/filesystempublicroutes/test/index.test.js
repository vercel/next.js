/* global fixture, test */
import { t } from 'testcafe'

import { join } from 'path'
import getPort from 'get-port'
import { fetchViaHTTP, initNextServerScript, killApp } from 'next-test-utils'
import clone from 'clone'

const appDir = join(__dirname, '../')

const startServer = async (ctx, optEnv = {}) => {
  const scriptPath = join(appDir, 'server.js')
  ctx.appPort = await getPort()
  const env = Object.assign(
    {},
    clone(process.env),
    { PORT: `${ctx.appPort}` },
    optEnv
  )

  ctx.server = await initNextServerScript(scriptPath, /ready on/i, env)
}

fixture('FileSystemPublicRoutes')
  .before(ctx => startServer(ctx))
  .after(ctx => killApp(ctx.server))

const fetch = (p, q) => fetchViaHTTP(t.fixtureCtx.appPort, p, q)

test('should not route to the index page', async t => {
  const res = await fetch('/')
  await t.expect(res.status).eql(404)
  const body = await res.text()
  await t.expect(body).match(/404/)
})

test('should route to exportPathMap defined routes in development', async t => {
  const res = await fetch('/exportpathmap-route')
  await t.expect(res.status).eql(200)
  const body = await res.text()
  await t.expect(body).match(/exportpathmap was here/)
})

test('should still handle /_next routes', async t => {
  await fetch('/exportpathmap-route') // make sure it's built
  const res = await fetch(
    '/_next/static/development/pages/exportpathmap-route.js'
  )
  await t.expect(res.status).eql(200)
  const body = await res.text()
  await t.expect(body).match(/exportpathmap was here/)
})
