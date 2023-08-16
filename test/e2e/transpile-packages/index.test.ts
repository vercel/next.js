import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'

describe('transpile packages', () => {
  let next: NextInstance

  if ((global as any).isNextDeploy) {
    it('should skip for deploy mode for now', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, './npm')),
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
        sass: 'latest',
      },
      packageJson: {
        scripts: {
          setup: `cp -r ./node_modules_bak/* ./node_modules`,
          build: 'yarn setup && next build',
          dev: 'yarn setup && next dev',
          start: 'next start',
        },
      },
      installCommand: 'yarn',
      startCommand: (global as any).isNextDev ? 'yarn dev' : 'yarn start',
      buildCommand: 'yarn build',
    })
  })
  afterAll(() => next.destroy())

  const { isNextDeploy } = global as any
  if (isNextDeploy) {
    it('should skip tests for next-deploy and react 17', () => {})
    return
  }

  describe('css', () => {
    it('should handle global css imports inside transpiled modules', async () => {
      const browser = await webdriver(next.url, '/global-css')

      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('body')).backgroundColor`
        )
      ).toBe('rgb(0, 0, 255)')
    })

    it('should handle global scss imports inside transpiled modules', async () => {
      const browser = await webdriver(next.url, '/global-scss')

      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('body')).backgroundColor`
        )
      ).toBe('rgb(0, 0, 255)')
    })

    it('should handle css modules imports inside transpiled modules', async () => {
      const browser = await webdriver(next.url, '/css-modules')

      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('h1')).backgroundColor`
        )
      ).toBe('rgb(0, 0, 255)')
    })

    it('should handle scss modules imports inside transpiled modules', async () => {
      const browser = await webdriver(next.url, '/scss-modules')

      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('h1')).backgroundColor`
        )
      ).toBe('rgb(0, 0, 255)')
    })
  })
})
