import { load } from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { getRouteCacheKey } from 'next/dist/server/lib/route-cache-key'
import { RouteKind } from 'next/dist/server/route-kind'

describe('dynamicParams: false with an empty cache', () => {
  const { next } = nextTestSetup({ files: __dirname })
  const owner = {
    kind: RouteKind.APP_PAGE,
    sourceRoute: '/closed/[slug]/page',
  }

  it('renders a build-generated path on every cache miss', async () => {
    const outputStart = next.cliOutput.length
    for (let i = 0; i < 2; i++) {
      const response = await next.fetch('/closed/known')
      expect(response.status).toBe(200)
      expect(load(await response.text())('#slug').text()).toBe('known')
    }
    expect(next.cliOutput.slice(outputStart)).toContain(
      `cache lookup ${getRouteCacheKey('/closed/known', owner)}`
    )
  })

  it('allows authenticated revalidation of an admitted path with no cache entry', async () => {
    const { previewModeId } = JSON.parse(
      await next.readFile('.next/server/preview-props.json')
    )
    const headers = { 'x-prerender-revalidate': previewModeId }
    const known = await next.fetch('/closed/known', { headers })
    expect(known.status).toBe(200)
    expect(load(await known.text())('#slug').text()).toBe('known')
    expect((await next.fetch('/closed/unlisted', { headers })).status).toBe(404)
  })

  it.each(['document', 'navigation', 'bot'])(
    'rejects an unlisted %s request before a cache lookup or render',
    async (kind) => {
      const headers: Record<string, string> = {}
      if (kind === 'navigation') headers.RSC = '1'
      if (kind === 'bot') headers['user-agent'] = 'Googlebot'
      const outputStart = next.cliOutput.length
      const response = await next.fetch('/closed/unlisted', { headers })
      expect(response.status).toBe(404)
      await response.text()
      const output = next.cliOutput.slice(outputStart)
      expect(output).not.toContain(
        `cache lookup ${getRouteCacheKey('/closed/unlisted', owner)}`
      )
      expect(output).not.toContain('closed page render unlisted')
      expect(output).not.toContain('NoFallbackError')
    }
  )
})
