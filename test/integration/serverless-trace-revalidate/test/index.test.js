/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  nextBuild,
  findPort,
  killApp,
  initNextServerScript,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
jest.setTimeout(1000 * 60 * 2)

let appPort
let app
let buildId

const nextStart = async (appDir, appPort) => {
  const scriptPath = join(appDir, 'server.js')
  const env = Object.assign({ ...process.env }, { PORT: `${appPort}` })

  return initNextServerScript(
    scriptPath,
    /ready on/i,
    env,
    /ReferenceError: options is not defined/
  )
}

describe('Serverless Trace', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
    buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
  })
  afterAll(() => killApp(app))

  it('should have revalidate page in prerender-manifest with correct interval', async () => {
    const data = await fs.readJSON(
      join(appDir, '.next/prerender-manifest.json')
    )
    expect(data.routes['/revalidate']).toEqual({
      initialRevalidateSeconds: 10,
      dataRoute: `/_next/data/${buildId}/revalidate.json`,
      srcRoute: null,
    })
  })

  it('should set correct Cache-Control header', async () => {
    const url = `http://localhost:${appPort}/revalidate`
    const res = await fetch(url)
    expect(res.headers.get('Cache-Control')).toMatch(
      's-maxage=10, stale-while-revalidate'
    )
  })
})
