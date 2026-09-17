import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

describe('image-priority-fetchpriority: automatically assign fetchPriority high to priority preloaded images', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render fetchpriority="high" on priority image and preload link in initial HTML', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    const html = await res.text()
    const $ = cheerio.load(html)

    // Check <link rel="preload" as="image"> in <head>
    const priorityPreload = $(
      'head link[rel="preload"][as="image"][fetchpriority="high"]'
    )
    expect(priorityPreload.length).toBeGreaterThan(0)

    // Preload link with explicit low priority
    const lowPreload = $(
      'head link[rel="preload"][as="image"][fetchpriority="low"]'
    )
    expect(lowPreload.length).toBeGreaterThan(0)

    // Check <img> attributes in rendered HTML
    const priorityImg = $('#priority-img')
    expect(priorityImg.attr('fetchpriority')).toBe('high')

    const lazyImg = $('#lazy-img')
    expect(lazyImg.attr('fetchpriority')).toBeUndefined()

    const overrideImg = $('#override-img')
    expect(overrideImg.attr('fetchpriority')).toBe('low')
  })

  it('should preserve fetchpriority in browser DOM during hydration', async () => {
    const browser = await next.browser('/')
    const priorityImgFetchPriority = await browser
      .elementById('priority-img')
      .getAttribute('fetchpriority')
    expect(priorityImgFetchPriority).toBe('high')

    const lazyImgFetchPriority = await browser
      .elementById('lazy-img')
      .getAttribute('fetchpriority')
    expect(lazyImgFetchPriority).toBeNull()

    const overrideImgFetchPriority = await browser
      .elementById('override-img')
      .getAttribute('fetchpriority')
    expect(overrideImgFetchPriority).toBe('low')

    // Check that preload link exists in the DOM <head>
    const preloadCount = await browser.eval(
      () =>
        document.querySelectorAll(
          'head link[rel="preload"][as="image"][fetchpriority="high"]'
        ).length
    )
    expect(preloadCount).toBeGreaterThan(0)
  })
})
