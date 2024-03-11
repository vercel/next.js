import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'
import { shouldRunTurboDevTest } from '../../lib/next-test-utils'

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
          build: 'next build',
          dev: `next ${shouldRunTurboDevTest() ? 'dev --turbo' : 'dev'}`,
          start: 'next start',
        },
      },
      installCommand: 'pnpm i',
      startCommand: (global as any).isNextDev ? 'pnpm dev' : 'pnpm start',
      buildCommand: 'pnpm build',
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
  describe('optional deps', () => {
    it('should not throw an error when optional deps are not installed', async () => {
      expect(next.cliOutput).not.toContain(
        "Module not found: Error: Can't resolve 'foo'"
      )
    })

    it('should hide dynammic module dependency errors from node_modules', async () => {
      expect(next.cliOutput).not.toContain(
        'Critical dependency: the request of a dependency is an expression'
      )
    })
  })
})
