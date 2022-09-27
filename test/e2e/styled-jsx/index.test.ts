import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = path.join(__dirname, 'app')

function runTest() {
  describe(`styled-jsx`, () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          node_modules: new FileRef(path.join(appDir, 'node_modules')),
          pages: new FileRef(path.join(appDir, 'pages')),
          '.npmrc': new FileRef(path.join(appDir, '.npmrc')),
        },
        packageJson: {
          scripts: {
            build: 'next build',
            dev: 'next dev',
            start: 'next start',
          },
        },
        dependencies: {
          // A different version of styled-jsx on user side,
          // using a different patch version comparing to the one from next.js
          'styled-jsx': '5.0.0',
        },
        startCommand: 'yarn ' + ((global as any).isNextDev ? 'dev' : 'start'),
        buildCommand: 'yarn build',
        installCommand: 'yarn',
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
