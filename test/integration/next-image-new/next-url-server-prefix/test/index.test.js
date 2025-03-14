/* eslint-env jest */

import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  fetchViaHTTP,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')

let appPort
let app

describe('Image Component nextUrlServerPrefix Tests', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      it('should include nextUrlServerPrefix when placeholder=blur during next dev', async () => {
        const res = await fetchViaHTTP(appPort, '/')
        expect(res.status).toBe(200)
        const html = await res.text()
        const backgroundImage = html.match(
          /<img[^>]+id=["']test1["'][^>]+style=["'][^"']*background-image:\s*url\(&quot(.*)&quot;\)/
        )[1]
        if (process.env.TURBOPACK) {
          expect(backgroundImage).toContain('data:image/svg+xml;')
        } else {
          expect(backgroundImage).toMatch(
            /\/my-server-prefix\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest(.+).jpg&amp;w=8&amp;q=70/
          )
        }
      })

      it('should prefix image source as import during next dev', async () => {
        const browser = await webdriver(appPort, '/')
        const id = 'test1'
        const bgImage = await browser.eval(
          `document.getElementById('${id}').src`
        )
        if (process.env.TURBOPACK) {
          expect(bgImage).toContain('data:image/svg+xml;')
        } else {
          expect(bgImage).toMatch(
            /\/my-server-prefix\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest(.+).jpg&w=(.+)&q=(.+)/
          )
        }
      })

      it('should prefix image source as string during next dev', async () => {
        const browser = await webdriver(appPort, '/string-src')
        const id = 'test1'
        const bgImage = await browser.eval(
          `document.getElementById('${id}').src`
        )
        if (process.env.TURBOPACK) {
          expect(bgImage).toContain('data:image/svg+xml;')
        } else {
          expect(bgImage).toMatch(
            /\/my-server-prefix\/_next\/image\?url=%2Ftest.jpg&w=(.+)&q=(.+)/
          )
        }
      })
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      it('should use base64 data url with placeholder=blur during next start', async () => {
        const res = await fetchViaHTTP(appPort, '/')
        expect(res.status).toBe(200)
        const html = await res.text()
        const backgroundImage = html.match(
          /<img[^>]+id=["']test1["'][^>]+style=["'][^"']*background-image:\s*url\(&quot(.*)&quot;\)/
        )[1]
        expect(backgroundImage).toMatch('data:image/jpeg;base64')
      })

      it('should prefix image source as import during next start', async () => {
        const browser = await webdriver(appPort, '/')
        const id = 'test1'
        const bgImage = await browser.eval(
          `document.getElementById('${id}').src`
        )
        if (process.env.TURBOPACK) {
          expect(bgImage).toContain('data:image/svg+xml;')
        } else {
          expect(bgImage).toMatch(
            /\/my-server-prefix\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest(.+).jpg&w=(.+)&q=(.+)/
          )
        }
      })

      it('should prefix image source as string during next start', async () => {
        const browser = await webdriver(appPort, '/string-src')
        const id = 'test1'
        const bgImage = await browser.eval(
          `document.getElementById('${id}').src`
        )
        if (process.env.TURBOPACK) {
          expect(bgImage).toContain('data:image/svg+xml;')
        } else {
          expect(bgImage).toMatch(
            /\/my-server-prefix\/_next\/image\?url=%2Ftest.jpg&w=(.+)&q=(.+)/
          )
        }
      })
    }
  )
})
