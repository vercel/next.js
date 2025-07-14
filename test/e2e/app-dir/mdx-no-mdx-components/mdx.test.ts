import { nextTestSetup } from 'e2e-utils'

describe(`mdx`, () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@next/mdx': 'canary',
      '@mdx-js/loader': '^2.2.1',
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

    it('should allow importing client components', async () => {
      const $ = await next.render$('/')
      expect($('h2').text()).toBe('This is a client component')
    })
  })

  describe('pages directory', () => {
    it('should work in initial html', async () => {
      const $ = await next.render$('/pages')
      expect($('h1').text()).toBe('Hello World')
      expect($('p').text()).toBe('This is MDX!')
    })
  })
})
