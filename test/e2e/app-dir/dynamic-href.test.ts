import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { getRedboxDescription, hasRedbox } from 'next-test-utils'
import path from 'path'
import webdriver from 'next-webdriver'

describe('dynamic-href', () => {
  const isDev = (global as any).isNextDev
  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'dynamic-href')),
      dependencies: {
        react: 'experimental',
        'react-dom': 'experimental',
      },
    })
  })
  afterAll(() => next.destroy())

  if (isDev) {
    it('should error when using href interpolation in app dir', async () => {
      const browser = await webdriver(next.url, '/')

      // Error should show up
      expect(await hasRedbox(browser, true)).toBeTrue()
      expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
        `"Error: Dynamic href \`/[slug]\` found while using the \`/app\` router, this is not supported. Read more: https://nextjs.org/docs/messages/app-dir-dynamic-href"`
      )

      // Fix error
      const pageContent = await next.readFile('app/page.js')
      await next.patchFile(
        'app/page.js',
        pageContent.replace("pathname: '/[slug]'", "pathname: '/slug'")
      )
      expect(await browser.waitForElementByCss('#link').text()).toBe('to slug')

      // Navigate to new page
      await browser.elementByCss('#link').click()
      expect(await browser.waitForElementByCss('#pathname').text()).toBe(
        '/slug'
      )
      expect(await browser.elementByCss('#slug').text()).toBe('1')
    })
  } else {
    it('should not error in prod', async () => {
      const browser = await webdriver(next.url, '/')
      expect(await browser.elementByCss('#link').text()).toBe('to slug')
    })
  }
})
