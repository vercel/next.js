import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('next-image-config-modules', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('provides full RSC and SSR image options before static page evaluation', async () => {
    const $ = await next.render$('/')
    for (const id of ['rsc', 'external-app', 'client']) {
      expect($(`#${id}`).attr('data-format')).toBe('image/avif')
      expect($(`#${id}`).attr('data-ttl')).toBe('123')
    }
    expect($('#rsc').attr('data-local-patterns')).toBe('/assets/**')
    expect($('#external-app').attr('data-path')).toBe('/custom-image')
    expect($('#client').attr('data-stage')).toBe('ssr')
    expect($('#client').attr('data-esm-format')).toBe('image/avif')
    expect($('#client').attr('data-esm-path')).toBe('/custom-image')
  })

  it('provides full image options to dynamic Pages and its external dependency', async () => {
    const $ = await next.render$('/pages-probe')
    for (const id of ['pages-ssr', 'external-pages']) {
      expect($(`#${id}`).attr('data-format')).toBe('image/avif')
      expect($(`#${id}`).attr('data-path')).toBe('/custom-image')
      expect($(`#${id}`).attr('data-ttl')).toBe('123')
    }
  })

  it('registers external image options before Pages static-paths workers load _app and _document', async () => {
    const $ = await next.render$('/worker-probe')
    expect($('#worker-probe').text()).toBe('worker-probe')
  })

  it('provides the reduced image options in the browser', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(
        await browser.eval(() =>
          document.querySelector('#client')?.getAttribute('data-stage')
        )
      ).toBe('browser')
    })
    const attributes = await browser.eval(() => {
      const client = document.querySelector('#client')!
      return {
        format: client.getAttribute('data-format'),
        path: client.getAttribute('data-path'),
        ttl: client.getAttribute('data-ttl'),
        localPatterns: client.getAttribute('data-local-patterns'),
        esmFormat: client.getAttribute('data-esm-format'),
        esmPath: client.getAttribute('data-esm-path'),
      }
    })
    expect(attributes).toEqual({
      format: 'missing',
      path: '/custom-image',
      ttl: 'missing',
      localPatterns: isNextDev ? '/assets/**' : 'missing',
      esmFormat: 'missing',
      esmPath: '/custom-image',
    })
  })

  it('uses the inlined config for Edge image consumers', async () => {
    const $ = await next.render$('/edge-probe')
    for (const id of ['edge-public', 'edge-modern', 'edge-legacy']) {
      const srcSet =
        $(`#${id}`).attr('data-srcset') ?? $(`#${id}`).attr('srcset')
      expect(srcSet).toBeDefined()
      const candidates = srcSet!.split(', ').map((candidate) => {
        const [src, width] = candidate.split(' ')
        const url = new URL(src, 'http://localhost')
        return [
          url.pathname,
          url.searchParams.get('url'),
          url.searchParams.get('w'),
          url.searchParams.get('q'),
          width,
        ]
      })
      expect(candidates).toEqual([
        ['/custom-image', '/assets/test.png', '768', '65', '768w'],
        ['/custom-image', '/assets/test.png', '1440', '65', '1440w'],
      ])
    }
  })
})
