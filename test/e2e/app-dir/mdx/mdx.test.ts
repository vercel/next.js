import { nextTestSetup } from 'e2e-utils'

for (const type of ['with-mdx-rs', 'without-mdx-rs']) {
  describe(`mdx ${type}`, () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        '@next/mdx': 'canary',
        '@mdx-js/loader': '^2.2.1',
        '@mdx-js/react': '^2.2.1',
        'rehype-katex': '7.0.1',
      },
      env: {
        WITH_MDX_RS: type === 'with-mdx-rs' ? 'true' : 'false',
      },
    })

    describe('app directory', () => {
      it('should work in initial html', async () => {
        const $ = await next.render$('/')
        expect($('h1').text()).toBe('Hello World')
        expect($('p').text()).toBe('This is MDX!')
      })

      it('should work using browser', async () => {
        const browser = await next.browser('/')
        expect(await browser.elementByCss('h1').text()).toBe('Hello World')
        expect(await browser.elementByCss('p').text()).toBe('This is MDX!')
      })

      it('should work in initial html with mdx import', async () => {
        const $ = await next.render$('/import')
        expect($('h1').text()).toBe('This is a title')
        expect($('p').text()).toBe('This is a paragraph')
      })

      it('should work using browser with mdx import', async () => {
        const browser = await next.browser('/import')
        expect(await browser.elementByCss('h1').text()).toBe('This is a title')
        expect(await browser.elementByCss('p').text()).toBe(
          'This is a paragraph'
        )
      })

      it('should allow overriding components', async () => {
        const browser = await next.browser('/')
        expect(await browser.elementByCss('h1').getComputedCss('color')).toBe(
          'rgb(255, 0, 0)'
        )
      })

      it('should allow importing client components', async () => {
        const $ = await next.render$('/')
        expect($('h2').text()).toBe('This is a client component')
      })

      it('should work with next/image', async () => {
        const $ = await next.render$('/image')
        expect($('img').attr('src')).toBe(
          '/_next/image?url=%2Ftest.jpg&w=384&q=75'
        )
      })

      if (type === 'without-mdx-rs') {
        it('should run plugins', async () => {
          const html = await next.render('/rehype-plugin')
          expect(html.includes('<mi>C</mi>')).toBe(true)
          expect(html.includes('<mi>L</mi>')).toBe(true)
        })
      }
    })

    describe('pages directory', () => {
      it('should work in initial html', async () => {
        const $ = await next.render$('/pages')
        expect($('h1').text()).toBe('Hello World')
        expect($('p').text()).toBe('This is MDX!')
      })

      // Recommended for tests that need a full browser
      it('should work using browser', async () => {
        const browser = await next.browser('/pages')
        expect(await browser.elementByCss('h1').text()).toBe('Hello World')
        expect(await browser.elementByCss('p').text()).toBe('This is MDX!')
      })

      it('should work in initial html with mdx import', async () => {
        const $ = await next.render$('/pages/import')
        expect($('h1').text()).toBe('This is a title')
        expect($('p').text()).toBe('This is a paragraph')
      })

      it('should work using browser with mdx import', async () => {
        const browser = await next.browser('/pages/import')
        expect(await browser.elementByCss('h1').text()).toBe('This is a title')
        expect(await browser.elementByCss('p').text()).toBe(
          'This is a paragraph'
        )
      })

      it('should allow overriding components', async () => {
        const browser = await next.browser('/pages')
        expect(await browser.elementByCss('h1').getComputedCss('color')).toBe(
          'rgb(255, 0, 0)'
        )
      })
    })
  })
}
