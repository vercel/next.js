/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  fetchViaHTTP
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60

const appDir = join(__dirname, '..')
let appPort
let server

describe('Cache Header', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    server = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(server))

  it('Does not set cache header with custom getInitialProps in _app', async () => {
    const res = await fetchViaHTTP(appPort, '/')
    expect(res.headers.get('Cache-Control')).not.toBe(
      's-maxage=86400, stale-while-revalidate'
    )
  })
})
