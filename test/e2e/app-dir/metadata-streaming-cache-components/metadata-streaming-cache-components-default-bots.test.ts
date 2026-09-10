import { isNextDev, nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'
import { assertNoConsoleErrors, retry } from 'next-test-utils'

function countSubstring(str: string, substr: string): number {
  return str.split(substr).length - 1
}

;(isNextDev ? describe.skip : describe)(
  'metadata streaming with Cache Components and the default bot list',
  () => {
    const { next, isNextDeploy } = nextTestSetup({
      files: __dirname,
      overrideFiles: {
        'next.config.js': `
          module.exports = {
            cacheComponents: true,
          }
        `,
      },
    })

    it('should serve the PPR shell to regular user agents', async () => {
      const res = await next.fetch('/partial')

      expect(res.status).toBe(200)
      if (!isNextDeploy) {
        expect(res.headers.get('x-nextjs-postponed')).toBe('1')
      }

      const $ = cheerio.load(await res.text())
      expect($('body title').text()).toBe('dynamic title')
      expect($('#dynamic-content').text()).toBe('dynamic content')
    })

    it('should block metadata for googleweblight within a full user agent', async () => {
      const res = await next.fetch('/partial', {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Linux; Android 4.2.1; en-us; Nexus 5 Build/JOP40D) AppleWebKit/535.19 (KHTML, like Gecko; googleweblight) Chrome/38.0.1025.166 Mobile Safari/535.19',
        },
      })

      expect(res.status).toBe(200)

      const $ = cheerio.load(await res.text())
      expect($('head title').text()).toBe('dynamic title')
      expect($('body title').length).toBe(0)
    })

    it('should block metadata while continuing to stream the body for a default HTML-limited bot', async () => {
      const abortController = new AbortController()
      let body:
        | (AsyncIterable<Uint8Array> & {
            cancel: () => void
          })
        | undefined

      try {
        const res = await next.fetch('/partial?stream=1', {
          headers: {
            'user-agent': 'Discordbot',
          },
          signal: abortController.signal,
        })

        expect(res.status).toBe(200)
        if (!isNextDeploy) {
          expect(res.headers.get('x-nextjs-postponed')).toBeNull()
        }
        expect(res.body).not.toBeNull()

        body = res.body! as unknown as AsyncIterable<Uint8Array> & {
          cancel: () => void
        }
        let initialHtml = ''

        for await (const chunk of body) {
          initialHtml += Buffer.from(chunk).toString()
          if (initialHtml.includes('dynamic-fallback')) {
            break
          }
        }

        expect(initialHtml).toContain('<title>dynamic title</title>')
        expect(initialHtml).toContain('dynamic-fallback')
        expect(initialHtml).not.toContain('dynamic-content')
      } finally {
        abortController.abort()
        body?.cancel()
      }
    })

    it('should use the PPR shell with streamed metadata for a DOM-capable bot', async () => {
      const res = await next.fetch('/partial?stream=delay', {
        headers: {
          'user-agent': 'Googlebot',
        },
      })

      expect(res.status).toBe(200)
      if (!isNextDeploy) {
        expect(res.headers.get('x-nextjs-postponed')).toBe('1')
      }

      const $ = cheerio.load(await res.text())
      expect($('head title').length).toBe(0)
      expect($('body title').text()).toBe('dynamic title')
      expect($('#dynamic-content').text()).toBe('dynamic content')
    })

    describe('Cache Components metadata streaming', () => {
      it('should generate metadata in head when page is fully static', async () => {
        const $ = await next.render$('/fully-static')
        expect($('head title').text()).toBe('fully static')
        expect(countSubstring($.html(), '<title>')).toBe(1)

        const browser = await next.browser('/fully-static', {
          pushErrorAsConsoleLog: true,
        })
        expect(
          await browser
            .waitForElementByCss('head title', { state: 'attached' })
            .text()
        ).toBe('fully static')
        await assertNoConsoleErrors(browser)
      })

      it('should insert static metadata in head when page content is dynamic', async () => {
        const $ = await next.render$('/dynamic-page')
        expect($('head title').text()).toBe('dynamic page')
        expect(countSubstring($.html(), '<title>')).toBe(1)

        const browser = await next.browser('/dynamic-page', {
          pushErrorAsConsoleLog: true,
        })
        expect(
          await browser
            .waitForElementByCss('head title', { state: 'attached' })
            .text()
        ).toBe('dynamic page')
        await assertNoConsoleErrors(browser)
      })

      it('should insert dynamic metadata in body when page is fully dynamic', async () => {
        const $ = await next.render$('/fully-dynamic')
        expect($('body title').text()).toBe('fully dynamic')
        expect(countSubstring($.html(), '<title>')).toBe(1)

        const browser = await next.browser('/fully-dynamic', {
          pushErrorAsConsoleLog: true,
        })
        expect(
          await browser
            .waitForElementByCss('body title', { state: 'attached' })
            .text()
        ).toBe('fully dynamic')
        await assertNoConsoleErrors(browser)
      })

      it('should insert dynamic metadata in body under a layout Suspense boundary', async () => {
        const $ = await next.render$('/dynamic-metadata/partial')
        expect($('body title').text()).toBe('dynamic-metadata - partial')
        expect(countSubstring($.html(), '<title>')).toBe(1)

        const browser = await next.browser('/dynamic-metadata/partial', {
          pushErrorAsConsoleLog: true,
        })
        expect(
          await browser
            .waitForElementByCss('body title', { state: 'attached' })
            .text()
        ).toBe('dynamic-metadata - partial')
        await assertNoConsoleErrors(browser)
      })

      it('should insert static metadata in head when dynamic page content is under a layout Suspense boundary', async () => {
        const $ = await next.render$('/dynamic-page/partial')
        expect($('head title').text()).toBe('dynamic-page - partial')
        expect(countSubstring($.html(), '<title>')).toBe(1)

        const browser = await next.browser('/dynamic-page/partial', {
          pushErrorAsConsoleLog: true,
        })
        expect(
          await browser
            .waitForElementByCss('head title', { state: 'attached' })
            .text()
        ).toBe('dynamic-page - partial')
        await assertNoConsoleErrors(browser)
      })

      it('should not yield hydration errors after revalidation', async () => {
        const browser = await next.browser('/partially-static', {
          pushErrorAsConsoleLog: true,
        })

        const initialDate = await browser.elementById('date').text()

        await retry(async () => {
          await browser.refresh()
          expect(await browser.elementById('date').text()).not.toBe(initialDate)
        })

        await assertNoConsoleErrors(browser)
      })
    })
  }
)
