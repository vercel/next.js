/* global jasmine, describe, beforeAll, afterAll, it, expect */

import { join } from 'path'
import fetch from 'node-fetch'
import cheerio from 'cheerio'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextExport,
  startStaticServer
} from 'next-test-utils'

describe('An app with multiple rootPaths', () => {
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5
  const appDir = join(__dirname, '../')

  const serverSetups = [
    {
      type: 'Next.js',
      setup: async () => {
        const port = await findPort()
        const server = await launchApp(appDir, port, true)

        // pre-build all pages at the start
        await renderViaHTTP(port, '/')

        return { port, server }
      }
    },
    {
      type: 'static',
      setup: async () => {
        const outDir = join(appDir, 'out')
        await nextBuild(appDir)
        await nextExport(appDir, { outdir: outDir })
        const server = await startStaticServer(join(appDir, 'out'))
        const port = server.address().port

        return { port, server }
      }
    }
  ]

  serverSetups.forEach(({ type, setup }) => {
    describe(`when hosted in a ${type} server`, () => {
      let server, port

      beforeAll(async () => {
        ({ server, port } = await setup())
      })

      afterAll(() => killApp(server))

      it('enables external _document definitions', async () => {
        const $ = await renderAndParse()
        expect($('body').hasClass('different-class-name')).toEqual(true)
      })

      it('enables external _app definitions', async () => {
        const $ = await renderAndParse()
        expect($('.some-injected-content').length).toEqual(1)
      })

      it('enables external pages', async () => {
        const $ = await renderAndParse('/healthcheck')
        expect($('.health-check').length).toEqual(1)
      })

      it('enables shared static files', async () => {
        const staticURL = `http://localhost:${port}/static/some-shared-static.txt`
        const response = await fetch(staticURL)
        const text = await response.text()
        expect(text.trim()).toEqual('Heyo!')
      })

      it('prefers local files over remote', async () => {
        const $ = await renderAndParse('/')
        expect($('.actual-application').length).toEqual(1)
      })

      async function renderAndParse (path = '/') {
        const html = await renderViaHTTP(port, path)
        return cheerio.load(html)
      }
    })
  })
})
