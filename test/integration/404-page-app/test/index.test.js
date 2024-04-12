/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  nextStart,
  nextBuild,
  fetchViaHTTP,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'

const appDir = join(__dirname, '../')
const gip404Err =
  /`pages\/404` can not have getInitialProps\/getServerSideProps/

let appPort
let app

describe('404 Page Support with _app', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      afterAll(() => killApp(app))

      it('should build successfully', async () => {
        const { code, stderr, stdout } = await nextBuild(appDir, [], {
          stderr: true,
          stdout: true,
        })

        expect(code).toBe(0)
        expect(stderr).not.toMatch(gip404Err)
        expect(stdout).not.toMatch(gip404Err)

        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })

      it('should not output static 404 if _app has getInitialProps', async () => {
        const browser = await webdriver(appPort, '/404')
        const isAutoExported = await browser.eval('__NEXT_DATA__.autoExport')
        expect(isAutoExported).toBeFalsy()
      })

      it('specify to use the 404 page still in the routes-manifest', async () => {
        const manifest = await fs.readJSON(
          join(appDir, '.next/routes-manifest.json')
        )
        expect(manifest.pages404).toBe(true)
      })

      it('should still use 404 page', async () => {
        const res = await fetchViaHTTP(appPort, '/abc')
        expect(res.status).toBe(404)
        const $ = cheerio.load(await res.text())
        expect($('#404-title').text()).toBe('Hi There')
      })
    }
  )
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      let stderr = ''
      let stdout = ''

      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort, {
          onStderr(msg) {
            stderr += msg
          },
          onStdout(msg) {
            stdout += msg
          },
        })
      })
      afterAll(() => killApp(app))

      it('should not show pages/404 GIP error if _app has GIP', async () => {
        const res = await fetchViaHTTP(appPort, '/abc')
        expect(res.status).toBe(404)
        const $ = cheerio.load(await res.text())
        expect($('#404-title').text()).toBe('Hi There')
        expect(stderr).not.toMatch(gip404Err)
        expect(stdout).not.toMatch(gip404Err)
      })
    }
  )
})
