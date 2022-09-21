import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'

describe('app-dir mpa navigation', () => {
  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  if (process.env.NEXT_TEST_REACT_VERSION === '^17') {
    it('should skip for react v17', () => {})
    return
  }
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        app: new FileRef(path.join(__dirname, 'mpa-navigation/app')),
        'next.config.js': new FileRef(
          path.join(__dirname, 'mpa-navigation/next.config.js')
        ),
      },
      dependencies: {
        react: 'experimental',
        'react-dom': 'experimental',
      },
    })
  })
  afterAll(() => next.destroy())

  describe('Should do a full page reload when switching root layout', () => {
    it('should work with route groups', async () => {
      const browser = await webdriver(next.url, '/one')

      expect(await browser.elementByCss('p').text()).toBe('One')
      await browser.eval('window.__TEST_NO_RELOAD = true')

      // Navigate to page with same root layout
      await browser.elementByCss('a').click()
      await browser.waitForElementByCss('#one-inner')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeTrue()

      // Navigate to page with different root layout
      await browser.elementByCss('a').click()
      await browser.waitForElementByCss('#two')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeUndefined()
    })

    it('should work with parallel routes', async () => {
      const browser = await webdriver(next.url, '/two')

      expect(await browser.elementByCss('p').text()).toBe('Two')
      await browser.eval('window.__TEST_NO_RELOAD = true')

      // Navigate to page with same root layout
      await browser.elementByCss('a').click()
      await browser.waitForElementByCss('#two-inner')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeTrue()

      // Navigate to page with different root layout
      await browser.elementByCss('a').click()
      await browser.waitForElementByCss('#parallel-one')
      await browser.waitForElementByCss('#parallel-two')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeUndefined()
    })

    it('should work with ordinary route', async () => {
      const browser = await webdriver(next.url, '/parallel')

      expect(await browser.elementById('parallel-one').text()).toBe('One')
      expect(await browser.elementById('parallel-two').text()).toBe('Two')
      await browser.eval('window.__TEST_NO_RELOAD = true')

      // Navigate to page with same root layout
      await browser.elementByCss('a').click()
      await browser.waitForElementByCss('#parallel-one-inner')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeTrue()

      // Navigate to page with different root layout
      await browser.elementByCss('a').click()
      await browser.waitForElementByCss('#three')
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toBeUndefined()
    })
  })
})
