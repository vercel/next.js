import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app dir - not-found - metadata', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  describe('static metadata in root not-found', () => {
    it('should render static metadata from root not-found page', async () => {
      const $ = await next.render$('/does-not-exist')
      expect($('title').text()).toBe('Page Not Found | My App')
      expect($('meta[name="description"]').attr('content')).toBe(
        'The page you are looking for does not exist'
      )
      expect($('meta[name="robots"]').attr('content')).toContain('noindex')
    })

    it('should render static metadata in browser for root not-found', async () => {
      const browser = await next.browser('/does-not-exist')
      await retry(async () => {
        expect(await browser.eval('document.title')).toBe(
          'Page Not Found | My App'
        )
      })
    })
  })

  describe('static metadata in nested not-found', () => {
    it('should render static metadata from nested not-found page', async () => {
      const browser = await next.browser('/static-metadata')
      expect(await browser.elementByCss('#static-not-found').text()).toBe(
        'Static metadata not found'
      )
      await retry(async () => {
        const title = await browser.eval('document.title')
        expect(title).toContain('Static Not Found Title')
      })
    })
  })

  describe('generateMetadata with params in dynamic route not-found', () => {
    it('should render dynamic metadata from not-found page using route params', async () => {
      const browser = await next.browser('/dynamic/404')
      expect(await browser.elementByCss('#not-found').text()).toBe(
        'Dynamic item not found'
      )
      await retry(async () => {
        const title = await browser.eval('document.title')
        expect(title).toContain('Item 404 Not Found')
      })
      // Check that the not-found description is present
      const descriptions = await browser.eval(
        'Array.from(document.querySelectorAll(\'meta[name="description"]\')).map(el => el.content)'
      )
      expect(descriptions).toContain(
        'The item with id "404" could not be found'
      )
    })

    it('should render different metadata for different params', async () => {
      const browser = await next.browser('/dynamic/999')
      await retry(async () => {
        const title = await browser.eval('document.title')
        expect(title).toContain('Item 999 Not Found')
      })
    })

    it('should return 404 status code', async () => {
      const res = await next.fetch('/dynamic/404')
      expect(res.status).toBe(404)
    })

    it('should render page content when page exists', async () => {
      const browser = await next.browser('/dynamic/123')
      expect(await browser.elementByCss('#page').text()).toBe(
        'Dynamic page: 123'
      )
    })
  })
})
