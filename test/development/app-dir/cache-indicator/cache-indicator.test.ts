import { nextTestSetup } from 'e2e-utils'

const enableCacheComponents = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('cache-indicator', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('is filled on initial load', async () => {
    const browser = await next.browser('/')

    const toast = await browser.elementByCss('[data-nextjs-toast]')

    expect(await toast.getAttribute('data-nextjs-cache-indicator')).toEqual(
      enableCacheComponents ? 'filled' : null
    )
  })
})
