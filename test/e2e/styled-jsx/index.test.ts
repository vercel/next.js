import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP, shouldRunTurboDevTest } from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = path.join(__dirname, 'app')

function runTest() {
  describe(`styled-jsx`, () => {
    let next: NextInstance

    beforeAll(async () => {
      const devCommand = shouldRunTurboDevTest() ? 'dev --turbo' : 'dev'

      next = await createNext({
        files: {
          node_modules_bak: new FileRef(path.join(appDir, 'node_modules_bak')),
          pages: new FileRef(path.join(appDir, 'pages')),
          '.npmrc': new FileRef(path.join(appDir, '.npmrc')),
        },
        packageJson: {
          scripts: {
            setup: `cp -r ./node_modules_bak/my-comps ./node_modules;`,
            build: `yarn setup && next build`,
            dev: `yarn setup && next ${devCommand}`,
            start: 'next start',
          },
        },
        dependencies: {
          'styled-jsx': '5.0.0', // styled-jsx on user side
        },
        startCommand: 'yarn ' + ((global as any).isNextDev ? 'dev' : 'start'),
        buildCommand: `yarn build`,
      })
    })
    afterAll(() => next.destroy())

    it('should contain styled-jsx styles during SSR', async () => {
      const html = await renderViaHTTP(next.url, '/')
      expect(html).toMatch(/color:.*?red/)
      expect(html).toMatch(/color:.*?cyan/)
    })

    it('should render styles during CSR', async () => {
      const browser = await webdriver(next.url, '/')
      const color = await browser.eval(
        `getComputedStyle(document.querySelector('button')).color`
      )

      expect(color).toMatch('0, 255, 255')
    })

    it('should render styles during CSR (AMP)', async () => {
      const browser = await webdriver(next.url, '/amp')
      const color = await browser.eval(
        `getComputedStyle(document.querySelector('button')).color`
      )

      expect(color).toMatch('0, 255, 255')
    })

    it('should render styles during SSR (AMP)', async () => {
      const html = await renderViaHTTP(next.url, '/amp')
      expect(html).toMatch(/color:.*?cyan/)
    })
  })
}

runTest()
