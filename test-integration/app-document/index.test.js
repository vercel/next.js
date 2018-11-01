/* eslint-env jest */
/* global page */
import { join } from 'path'
import fsTimeMachine from 'fs-time-machine'

import { runNextDev } from 'next-test-utils'

let server

describe('Document and App', () => {
  beforeAll(async () => {
    server = await runNextDev(__dirname)
  })
  afterAll(() => server.close())
  afterEach(fsTimeMachine.restore)

  describe('Client side', () => {
    it('should detect the changes to pages/_app.js and display it', async () => {
      const _app = await fsTimeMachine(join(__dirname, './pages/_app.js'))

      await page.goto(server.getURL('/'))
      await expect(page).toMatchElement('#hello-hmr', { text: 'Hello HMR' })

      await _app.replace('Hello HMR', 'Hi HMR')
      await page.waitForRequest(request => /\.hot-update\.js$/.test(request.url()))
      await expect(page).toMatchElement('#hello-hmr', { text: 'Hi HMR' })

      await _app.restore()
      await page.waitForRequest(request => /\.hot-update\.js$/.test(request.url()))
      await expect(page).toMatchElement('#hello-hmr', { text: 'Hello HMR' })
    })

    it('should detect the changes to pages/_document.js and display it', async () => {
      const _document = await fsTimeMachine(join(__dirname, './pages/_document.js'))

      await page.goto(server.getURL('/'))
      await expect(page).toMatchElement('#document-hmr', { text: 'Hello Document HMR' })

      await _document.replace('Hello Document HMR', 'Hi Document HMR')
      await page.waitForNavigation()
      await expect(page).toMatchElement('#document-hmr', { text: 'Hi Document HMR' })

      await _document.restore()
      await page.waitForNavigation()
      await expect(page).toMatchElement('#document-hmr', { text: 'Hello Document HMR' })
    })

    it('should keep state between page navigations', async () => {
      await page.goto(server.getURL('/'))
      const element = await expect(page).toMatchElement('#random-number')
      const randomNumber = await element.getProperty('textContent')
      await expect(page).toClick('#about-link')
      await page.waitFor('.page-about')
      await expect(page).toMatchElement('#random-number', {
        text: randomNumber
      })
    })

    it('It should share module state with pages', async () => {
      await page.goto(server.getURL('/shared'))
      await expect(page).toMatchElement('#currentstate', {
        text: 'UPDATED CLIENT'
      })
    })
  })

  describe('Rendering via HTTP', () => {
    describe('_document', () => {
      test('It has a custom body class', async () => {
        const $ = await server.fetch$('/')
        expect($('body').hasClass('custom_class'))
      })

      test('It injects custom head tags', async () => {
        const $ = await server.fetch$('/')
        expect($('head').text().includes('body { margin: 0 }'))
      })

      test('It passes props from Document.getInitialProps to Document', async () => {
        const $ = await server.fetch$('/')
        expect($('#custom-property').text() === 'Hello Document')
      })

      test('It adds nonces to all scripts and preload links', async () => {
        const $ = await server.fetch$('/')
        const nonce = 'test-nonce'
        let noncesAdded = true
        $('script, link[rel=preload]').each((index, element) => {
          if ($(element).attr('nonce') !== nonce) noncesAdded = false
        })
        expect(noncesAdded).toBe(true)
      })

      test('It renders ctx.renderPage with enhancer correctly', async () => {
        const $ = await server.fetch$('/?withEnhancer=true')
        const nonce = 'RENDERED'
        expect($('#render-page-enhance-component').text().includes(nonce)).toBe(true)
      })

      test('It renders ctx.renderPage with enhanceComponent correctly', async () => {
        const $ = await server.fetch$('/?withEnhanceComponent=true')
        const nonce = 'RENDERED'
        expect($('#render-page-enhance-component').text().includes(nonce)).toBe(true)
      })

      test('It renders ctx.renderPage with enhanceApp correctly', async () => {
        const $ = await server.fetch$('/?withEnhanceApp=true')
        const nonce = 'RENDERED'
        expect($('#render-page-enhance-app').text().includes(nonce)).toBe(true)
      })

      test('It renders ctx.renderPage with enhanceApp and enhanceComponent correctly', async () => {
        const $ = await server.fetch$('/?withEnhanceComponent=true&withEnhanceApp=true')
        const nonce = 'RENDERED'
        expect($('#render-page-enhance-app').text().includes(nonce)).toBe(true)
        expect($('#render-page-enhance-component').text().includes(nonce)).toBe(true)
      })
    })

    describe('_app', () => {
      test('It shows a custom tag', async () => {
        const $ = await server.fetch$('/')
        expect($('hello-app').text() === 'Hello App')
      })

      // For example react context uses shared module state
      // Also known as singleton modules
      test('It should share module state with pages', async () => {
        const $ = await server.fetch$('/shared')
        expect($('#currentstate').text() === 'UPDATED')
      })
    })
  })

  // TODO: Fix this test. More info https://github.com/zeit/next.js/pull/4939#pullrequestreview-170031605
  describe('With CSP enabled', () => {
    it.skip('should load inline script by hash', async () => {
      await page.goto(server.getURL('/?withCSP=hash'))
    })

    it.skip('should load inline script by nonce', async () => {
      await page.goto(server.getURL('/?withCSP=nonce'))
    })
  })
})
