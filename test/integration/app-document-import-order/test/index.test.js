/* eslint-env jest */

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

jest.setTimeout(1000 * 60)
const appDir = join(__dirname, '../')
let appPort
let server
let app

describe('Root components import order', () => {
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

  const respectsSideEffects = async () => {
    const res = await fetchViaHTTP(appPort, '/')
    const html = await res.text()
    const $ = cheerio.load(html)

    const expectSideEffectsOrder = ['_document', '_app', 'page']

    const sideEffectCalls = $('.side-effect-calls')

    Array.from(sideEffectCalls).forEach((sideEffectCall, index) => {
      expect($(sideEffectCall).text()).toEqual(expectSideEffectsOrder[index])
    })
  }

  it(
    'root components should be imported in this order _document > _app > page in order to respect side effects',
    respectsSideEffects
  )

  const respectsChunkAttachmentOrder = async () => {
    const res = await fetchViaHTTP(appPort, '/')
    const html = await res.text()
    const $ = cheerio.load(html)

    const requiredByRegex = /^\/_next\/static\/chunks\/(requiredBy\w*).*\.js/
    const chunks = Array.from($('head').contents())
      .filter(
        (child) =>
          child.type === 'tag' &&
          child.name === 'link' &&
          child.attribs.href.match(requiredByRegex)
      )
      .map((child) => child.attribs.href.match(requiredByRegex)[1])

    const requiredByAppIndex = chunks.indexOf('requiredByApp')
    const requiredByPageIndex = chunks.indexOf('requiredByPage')

    expect(requiredByAppIndex).toBeLessThan(requiredByPageIndex)
  }

  it(
    '_app chunks should be attached to de dom before page chunks',
    respectsChunkAttachmentOrder
  )

  describe('on dev server', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(join(__dirname, '../'), appPort)
    })

    afterAll(() => killApp(app))

    it(
      'root components should be imported in this order _document > _app > page in order to respect side effects',
      respectsSideEffects
    )

    it(
      '_app chunks should be attached to de dom before page chunks',
      respectsChunkAttachmentOrder
    )
  })
})
