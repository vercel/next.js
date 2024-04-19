/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import {
  nextBuild,
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextStart,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let app

const context = {}

describe('disabled runtime JS', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()

        await nextBuild(appDir)
        app = await nextStart(appDir, appPort)

        context.appPort = appPort
      })
      afterAll(() => killApp(app))

      it('should render the page', async () => {
        const html = await renderViaHTTP(appPort, '/')
        expect(html).toMatch(/Hello World/)
      })

      it('should not have __NEXT_DATA__ script', async () => {
        const html = await renderViaHTTP(appPort, '/')

        const $ = cheerio.load(html)
        expect($('script#__NEXT_DATA__').length).toBe(0)
      })

      it('should not have scripts', async () => {
        const html = await renderViaHTTP(appPort, '/')
        const $ = cheerio.load(html)
        expect($('script[src]').length).toBe(0)
      })

      it('should not have preload links', async () => {
        const html = await renderViaHTTP(appPort, '/')
        const $ = cheerio.load(html)
        expect($('link[rel=preload]').length).toBe(0)
      })
    }
  )
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      let appPort
      let app

      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(join(__dirname, '../'), appPort)
      })

      afterAll(() => killApp(app))

      // eslint-disable-next-line jest/no-identical-title
      it('should render the page', async () => {
        const html = await renderViaHTTP(appPort, '/')
        expect(html).toMatch(/Hello World/)
      })

      // eslint-disable-next-line jest/no-identical-title
      it('should not have __NEXT_DATA__ script', async () => {
        const html = await renderViaHTTP(appPort, '/')

        const $ = cheerio.load(html)
        expect($('script#__NEXT_DATA__').length).toBe(1)
      })

      it('should have a script for each preload link', async () => {
        const html = await renderViaHTTP(appPort, '/')
        const $ = cheerio.load(html)
        const preloadLinks = $('link[rel=preload]')
        preloadLinks.each((idx, element) => {
          const url = $(element).attr('href')
          expect($(`script[src="${url}"]`).length).toBe(1)
        })
      })
    }
  )
})
