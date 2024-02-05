/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import {
  nextBuild,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextStart,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let app

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

const respectsChunkAttachmentOrder = async () => {
  const res = await fetchViaHTTP(appPort, '/')
  const html = await res.text()
  const $ = cheerio.load(html)

  const requiredByRegex = /^\/_next\/static\/chunks\/(requiredBy\w*).*\.js/
  const chunks = Array.from($('head').contents())
    .filter(
      (child) =>
        child.type === 'script' &&
        child.name === 'script' &&
        child.attribs.src.match(requiredByRegex)
    )
    .map((child) => child.attribs.src.match(requiredByRegex)[1])

  const requiredByAppIndex = chunks.indexOf('requiredByApp')
  const requiredByPageIndex = chunks.indexOf('requiredByPage')

  expect(requiredByAppIndex).toBeLessThan(requiredByPageIndex)
}

describe('Root components import order', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it(
      '_app chunks should be attached to de dom before page chunks',
      respectsChunkAttachmentOrder
    )
    it(
      'root components should be imported in this order _document > _app > page in order to respect side effects',
      respectsSideEffects
    )
  })
})

describe('development mode', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(join(__dirname, '../'), appPort)
  })

  afterAll(() => killApp(app))

  it(
    'root components should be imported in this order _document > _app > page in order to respect side effects',
    respectsSideEffects
  )

  // Test relies on webpack splitChunks overrides.
  ;(process.env.TURBOPACK ? describe.skip : describe)(
    'Skipped in Turbopack',
    () => {
      it(
        '_app chunks should be attached to de dom before page chunks',
        respectsChunkAttachmentOrder
      )
    }
  )
})
