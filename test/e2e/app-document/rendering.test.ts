import { retry } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('Document and App - Rendering via HTTP', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  describe('_document', () => {
    it('should include required elements in rendered html', async () => {
      const $ = await next.render$('/')
      // It has a custom html class
      expect($('html').hasClass('test-html-props')).toBe(true)
      // It has a custom body class
      expect($('body').hasClass('custom_class')).toBe(true)
      // It injects custom head tags
      expect($('head').text()).toMatch('body { margin: 0 }')
      // It has __NEXT_DATA__ script tag
      expect($('script#__NEXT_DATA__')).toBeTruthy()
      // It passes props from Document.getInitialProps to Document
      expect($('#custom-property').text()).toBe('Hello Document')
    })

    it('Document.getInitialProps returns html prop representing app shell', async () => {
      // Extract css-in-js-class from the rendered HTML, which is returned by Document.getInitialProps
      const $index = await next.render$('/')
      const $about = await next.render$('/about')
      expect($index('#css-in-cjs-count').text()).toBe('2')
      expect($about('#css-in-cjs-count').text()).toBe('0')
    })

    it('adds nonces to all scripts and preload links', async () => {
      const $ = await next.render$('/')
      const nonce = 'test-nonce'
      let noncesAdded = true
      $('script, link[rel=preload]').each((index, element) => {
        if ($(element).attr('nonce') !== nonce) noncesAdded = false
      })
      expect(noncesAdded).toBe(true)
    })

    it('adds crossOrigin to all scripts and preload links', async () => {
      const $ = await next.render$('/')
      const crossOrigin = 'anonymous'
      $('script, link[rel=preload]').each((index, element) => {
        expect($(element).attr('crossorigin') === crossOrigin).toBeTruthy()
      })
    })

    it('renders ctx.renderPage with enhancer correctly', async () => {
      const $ = await next.render$('/?withEnhancer=true')
      const nonce = 'RENDERED'
      expect($('#render-page-enhance-component').text().includes(nonce)).toBe(
        true
      )
    })

    it('renders ctx.renderPage with enhanceComponent correctly', async () => {
      const $ = await next.render$('/?withEnhanceComponent=true')
      const nonce = 'RENDERED'
      expect($('#render-page-enhance-component').text().includes(nonce)).toBe(
        true
      )
    })

    it('renders ctx.renderPage with enhanceApp correctly', async () => {
      const $ = await next.render$('/?withEnhanceApp=true')
      const nonce = 'RENDERED'
      expect($('#render-page-enhance-app').text().includes(nonce)).toBe(true)
    })

    it('renders ctx.renderPage with enhanceApp and enhanceComponent correctly', async () => {
      const $ = await next.render$(
        '/?withEnhanceComponent=true&withEnhanceApp=true'
      )
      const nonce = 'RENDERED'
      expect($('#render-page-enhance-app').text().includes(nonce)).toBe(true)
      expect($('#render-page-enhance-component').text().includes(nonce)).toBe(
        true
      )
    })

    if (isNextDev) {
      // This is a workaround to fix https://github.com/vercel/next.js/issues/5860
      // TODO: remove this workaround when https://bugs.webkit.org/show_bug.cgi?id=187726 is fixed.
      it('adds a timestamp to link tags with preload attribute to invalidate the cache in dev', async () => {
        const $ = await next.render$('/', undefined, {
          headers: { 'user-agent': 'Safari' },
        })
        $('link[rel=preload]').each((index, element) => {
          const href = $(element).attr('href')
          expect(href.match(/\?/g)).toHaveLength(1)
          expect(href).toMatch(/\?ts=/)
        })
        $('script[src]').each((index, element) => {
          const src = $(element).attr('src')
          expect(src.match(/\?/g)).toHaveLength(1)
          expect(src).toMatch(/\?ts=/)
        })
      })
    }
  })

  describe('_app', () => {
    it('shows a custom tag', async () => {
      const $ = await next.render$('/')
      expect($('#hello-app').text()).toBe('Hello App')
    })

    // For example react context uses shared module state
    // Also known as singleton modules
    it('should share module state with pages', async () => {
      const $ = await next.render$('/shared')
      expect($('#currentstate').text()).toBe('UPDATED')
    })

    if (isNextDev) {
      it('should show valid error when thrown in _app getInitialProps', async () => {
        const errMsg = 'have an error from _app getInitialProps'
        const origContent = await next.readFile('pages/_app.js')

        expect(await next.render('/')).toContain('page-index')

        await next.patchFile(
          'pages/_app.js',
          origContent.replace(
            '// throw _app GIP err here',
            `throw new Error("${errMsg}")`
          )
        )

        let foundErr = false
        try {
          await retry(async () =>
            expect(await next.render('/')).toContain(errMsg)
          )
          foundErr = true
        } finally {
          await next.patchFile('pages/_app.js', origContent)

          // Make sure _app is restored
          await retry(async () =>
            expect(await next.render('/')).toContain('page-index')
          )
          expect(foundErr).toBeTruthy()
        }
      })
    }
  })
})
