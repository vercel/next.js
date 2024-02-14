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
          pages: new FileRef(path.join(appDir, 'pages')),
          node_modules: new FileRef(path.join(appDir, 'node_modules')),
          '.npmrc': new FileRef(path.join(appDir, '.npmrc')),
        },
        packageJson: {
          scripts: {
            build: `next build`,
            dev: `next ${devCommand}`,
            start: 'next start',
          },
        },
        dependencies: {
          'styled-jsx': '5.0.0', // styled-jsx on user side
        },
        installCommand: 'pnpm i',
        startCommand: (global as any).isNextDev ? 'pnpm dev' : 'pnpm start',
        buildCommand: `pnpm build`,
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
