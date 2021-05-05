// /* eslint-env jest */

import { join } from 'path'
import { nextBuild, nextExport } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const nextdir = join(__dirname, '../app')
const outdir = join(nextdir, 'out')
const appdir = join(outdir, 'main.js')
let app = null

if (process.env.TEST_ELECTRON) {
  const electron = require(join(nextdir, 'node_modules/electron'))
  const { Application } = require(join(nextdir, 'node_modules/spectron'))

  describe('Parse Relative Url', () => {
    describe('File Protocol via Electron', () => {
      beforeAll(async () => {
        await nextBuild(nextdir)
        await nextExport(nextdir, { outdir })

        app = new Application({
          path: electron,
          args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            appdir,
          ],
          chromeDriverArgs: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        })
        await app.start()
      })

      afterAll(async () => {
        if (app && app.isRunning()) {
          await app.stop()
        }
      })

      it('app init', async () => {
        const count = await app.client.getWindowCount()
        expect(count).toEqual(1)
      })

      it('should render the home page', async () => {
        const text = await app.client.$('#home-page p').getText()
        expect(text).toBe('This is the home page')
      })

      it('should do navigations via Link', async () => {
        await app.client.$('#about-via-link').click()
        const text = await app.client.$('#about-page p').getText()

        expect(text).toBe('This is the about page')
      })

      it('should do back to home page via Link', async () => {
        await app.client.$('#about-page a').click()
        const text = await app.client.$('#home-page p').getText()

        expect(text).toBe('This is the home page')
      })

      it('should do navigations via Router', async () => {
        await app.client.$('#about-via-router').click()
        const text = await app.client.$('#about-page p').getText()

        expect(text).toBe('This is the about page')
      })
    })
  })
} else {
  it('Should skip testing electron without process.env.TEST_ELECTRON set', () => {})
}
