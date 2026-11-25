import { load } from 'cheerio'
import { nextTestSetup } from 'e2e-utils'

describe('dynamicParams: false in minimal mode', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // This fixture invokes the renderer directly, bypassing a deployment's
    // public router. Public requests to these unlisted URLs must still 404.
    skipDeployment: true,
    env: {
      NEXT_PRIVATE_TEST_HEADERS: '1',
      NEXT_PRIVATE_MINIMAL_MODE: '1',
    },
  })

  // These are direct invocations of a platform-selected renderer. The external
  // router is responsible for deciding which public URLs may reach it.
  it.each(['known', 'unlisted'])(
    'renders a platform-selected document for %s',
    async (slug) => {
      const response = await next.fetch(`/products/${slug}`, {
        headers: { 'x-matched-path': '/products/[slug]' },
      })
      expect(response.status).toBe(200)
      expect(load(await response.text())('#slug').text()).toBe(slug)
    }
  )

  it('renders a platform-selected RSC request', async () => {
    const response = await next.fetch('/products/unlisted-rsc', {
      headers: { 'x-matched-path': '/products/[slug]', RSC: '1' },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/x-component')
    expect(await response.text()).toContain('unlisted-rsc')
  })

  it('leaves revalidate-if-generated admission to the platform cache', async () => {
    const { previewModeId } = JSON.parse(
      await next.readFile('.next/server/preview-props.json')
    )
    const response = await next.fetch('/products/platform-revalidation', {
      headers: {
        'x-matched-path': '/products/[slug]',
        'x-prerender-revalidate': previewModeId,
        'x-prerender-revalidate-if-generated': '1',
      },
    })
    expect(response.status).toBe(200)
    expect(load(await response.text())('#slug').text()).toBe(
      'platform-revalidation'
    )
  })
})
