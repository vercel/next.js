/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import cheerio from 'cheerio'
import {
  stopApp,
  startApp,
  nextBuild,
  nextServer,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60
const appDir = join(__dirname, '../')
let appPort
let server
let app

describe('Custom root components with side effects', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true,
    })

    server = await startApp(app)
    appPort = server.address().port
  })
  afterAll(() => stopApp(server))

  it('root components should be imported in this order _document > _app > page in order to respect side effects', async () => {
    const res = await fetchViaHTTP(appPort, '/')
    const html = await res.text()
    const $ = cheerio.load(html)

    const expectSideEffectsOrder = ['_document', '_app', 'page']

    const sideEffectCalls = $('.side-effect-calls')

    Array.from(sideEffectCalls).forEach((sideEffectCall, index) => {
      expect($(sideEffectCall).text()).toEqual(expectSideEffectsOrder[index])
    })
  })

  describe('on dev server', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(join(__dirname, '../'), appPort)
    })

    afterAll(() => killApp(app))

    it('root components should be imported in this order _document > _app > page in order to respect side effects', async () => {
      const res = await fetchViaHTTP(appPort, '/')
      const html = await res.text()
      const $ = cheerio.load(html)

      const expectSideEffectsOrder = ['_document', '_app', 'page']

      const sideEffectCalls = $('.side-effect-calls')

      Array.from(sideEffectCalls).forEach((sideEffectCall, index) => {
        expect($(sideEffectCall).text()).toEqual(expectSideEffectsOrder[index])
      })
    })
  })
})
