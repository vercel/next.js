import { join } from 'path'
import cheerio from 'cheerio'
import {
  getBrowserBodyText,
  renderViaHTTP,
  retry,
  waitFor,
} from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'
import type { NextConfig } from 'next'

describe.each([
  { basePath: '', assetPrefix: '' },
  { basePath: '', assetPrefix: '/asset-prefix' },
  { basePath: '/docs', assetPrefix: '' },
  { basePath: '/docs', assetPrefix: '/asset-prefix' },
])(
  'HMR - Hot Module Reload, nextConfig: %o',
  (nextConfig: Partial<NextConfig>) => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig,
      patchFileDelay: 500,
    })
    const { basePath } = nextConfig

    describe('delete a page and add it back', () => {
      it('should load the page properly', async () => {
        const contactPagePath = join('pages', 'hmr', 'contact.js')
        const newContactPagePath = join('pages', 'hmr', '_contact.js')
        const browser = await next.browser(basePath + '/hmr/contact')
        try {
          const text = await browser.elementByCss('p').text()
          expect(text).toBe('This is the contact page.')

          // Rename the file to mimic a deleted page
          await next.renameFile(contactPagePath, newContactPagePath)

          await retry(async () => {
            expect(await getBrowserBodyText(browser)).toMatch(
              /This page could not be found/
            )
          })

          // Rename the file back to the original filename
          await next.renameFile(newContactPagePath, contactPagePath)

          // wait until the page comes back
          await retry(async () => {
            expect(await getBrowserBodyText(browser)).toMatch(
              /This is the contact page/
            )
          })

          expect(next.cliOutput).toContain('Compiled /_error')
        } finally {
          await next
            .renameFile(newContactPagePath, contactPagePath)
            .catch(() => {})
        }
      })
    })

    describe('editing a page', () => {
      it('should detect the changes and display it', async () => {
        const browser = await next.browser(basePath + '/hmr/about')
        const text = await browser.elementByCss('p').text()
        expect(text).toBe('This is the about page.')

        const aboutPagePath = join('pages', 'hmr', 'about.js')

        const originalContent = await next.readFile(aboutPagePath)
        const editedContent = originalContent.replace(
          'This is the about page',
          'COOL page'
        )

        // change the content
        try {
          await next.patchFile(aboutPagePath, editedContent)
          await retry(async () => {
            expect(await getBrowserBodyText(browser)).toMatch(/COOL page/)
          })
        } finally {
          // add the original content
          await next.patchFile(aboutPagePath, originalContent)
        }

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })
      })

      it('should not reload unrelated pages', async () => {
        const browser = await next.browser(basePath + '/hmr/counter')
        const text = await browser
          .elementByCss('button')
          .click()
          .elementByCss('button')
          .click()
          .elementByCss('p')
          .text()
        expect(text).toBe('COUNT: 2')

        const aboutPagePath = join('pages', 'hmr', 'about.js')

        const originalContent = await next.readFile(aboutPagePath)
        const editedContent = originalContent.replace(
          'This is the about page',
          'COOL page'
        )

        try {
          // Change the about.js page
          await next.patchFile(aboutPagePath, editedContent)

          // Check whether the this page has reloaded or not.
          await retry(async () => {
            expect(await browser.elementByCss('p').text()).toMatch(/COUNT: 2/)
          })
        } finally {
          // restore the about page content.
          await next.patchFile(aboutPagePath, originalContent)
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/vercel/styled-jsx/issues/425
      it('should update styles correctly', async () => {
        const browser = await next.browser(basePath + '/hmr/style')
        const pTag = await browser.elementByCss('.hmr-style-page p')
        const initialFontSize = await pTag.getComputedCss('font-size')

        expect(initialFontSize).toBe('100px')

        const pagePath = join('pages', 'hmr', 'style.js')

        const originalContent = await next.readFile(pagePath)
        const editedContent = originalContent.replace('100px', '200px')

        // Change the page
        await next.patchFile(pagePath, editedContent)

        try {
          // Check whether the this page has reloaded or not.
          await retry(async () => {
            const editedPTag = await browser.elementByCss('.hmr-style-page p')
            expect(await editedPTag.getComputedCss('font-size')).toBe('200px')
          })
        } finally {
          // Finally is used so that we revert the content back to the original regardless of the test outcome
          // restore the about page content.
          await next.patchFile(pagePath, originalContent)
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/vercel/styled-jsx/issues/425
      it('should update styles in a stateful component correctly', async () => {
        const browser = await next.browser(
          basePath + '/hmr/style-stateful-component'
        )
        const pagePath = join('pages', 'hmr', 'style-stateful-component.js')
        const originalContent = await next.readFile(pagePath)
        try {
          const pTag = await browser.elementByCss('.hmr-style-page p')
          const initialFontSize = await pTag.getComputedCss('font-size')

          expect(initialFontSize).toBe('100px')
          const editedContent = originalContent.replace('100px', '200px')

          // Change the page
          await next.patchFile(pagePath, editedContent)

          // Check whether the this page has reloaded or not.
          await retry(async () => {
            const editedPTag = await browser.elementByCss('.hmr-style-page p')
            expect(await editedPTag.getComputedCss('font-size')).toBe('200px')
          })
        } finally {
          await next.patchFile(pagePath, originalContent)
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/vercel/styled-jsx/issues/425
      it('should update styles in a dynamic component correctly', async () => {
        const browser = await next.browser(
          basePath + '/hmr/style-dynamic-component'
        )
        const secondBrowser = await next.browser(
          basePath + '/hmr/style-dynamic-component'
        )
        const pagePath = join('components', 'hmr', 'dynamic.js')
        const originalContent = await next.readFile(pagePath)
        try {
          const div = await browser.elementByCss('#dynamic-component')
          const initialClientClassName = await div.getAttribute('class')
          const initialFontSize = await div.getComputedCss('font-size')

          expect(initialFontSize).toBe('100px')

          const initialHtml = await renderViaHTTP(
            next.url,
            basePath + '/hmr/style-dynamic-component'
          )
          expect(initialHtml.includes('100px')).toBeTruthy()

          const $initialHtml = cheerio.load(initialHtml)
          const initialServerClassName =
            $initialHtml('#dynamic-component').attr('class')

          expect(initialClientClassName === initialServerClassName).toBeTruthy()

          const editedContent = originalContent.replace('100px', '200px')

          // Change the page
          await next.patchFile(pagePath, editedContent)

          // wait for 5 seconds
          await waitFor(5000)

          // Check whether the this page has reloaded or not.
          const editedDiv =
            await secondBrowser.elementByCss('#dynamic-component')
          const editedClientClassName = await editedDiv.getAttribute('class')
          const editedFontSize = await editedDiv.getComputedCss('font-size')
          const browserHtml = await secondBrowser.eval(
            'document.documentElement.innerHTML'
          )

          expect(editedFontSize).toBe('200px')
          expect(browserHtml.includes('font-size:200px')).toBe(true)
          expect(browserHtml.includes('font-size:100px')).toBe(false)

          const editedHtml = await renderViaHTTP(
            next.url,
            basePath + '/hmr/style-dynamic-component'
          )
          expect(editedHtml.includes('200px')).toBeTruthy()
          const $editedHtml = cheerio.load(editedHtml)
          const editedServerClassName =
            $editedHtml('#dynamic-component').attr('class')

          expect(editedClientClassName === editedServerClassName).toBe(true)
        } finally {
          // Finally is used so that we revert the content back to the original regardless of the test outcome
          // restore the about page content.
          await next.patchFile(pagePath, originalContent)
        }
      })

      it('should not full reload when nonlatin characters are used', async () => {
        const browser = await next.browser(basePath + '/hmr/nonlatin')
        const pagePath = join('pages', 'hmr', 'nonlatin.js')
        const originalContent = await next.readFile(pagePath)
        try {
          const timeOrigin = await browser.eval('performance.timeOrigin')
          const editedContent = originalContent.replace(
            '<div>テスト</div>',
            '<div class="updated">テスト</div>'
          )

          // Change the page
          await next.patchFile(pagePath, editedContent)

          await browser.waitForElementByCss('.updated')

          expect(await browser.eval('performance.timeOrigin')).toEqual(
            timeOrigin
          )
        } finally {
          // Finally is used so that we revert the content back to the original regardless of the test outcome
          // restore the about page content.
          await next.patchFile(pagePath, originalContent)
        }
      })
    })
  }
)
