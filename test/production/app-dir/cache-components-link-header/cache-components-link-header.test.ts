import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { load } from 'cheerio'

const CONFIG_LINK = '</llms.txt>; rel="llms-txt"'

function countLinks(header: string | null) {
  const links = header ? header.split(/,\s*(?=<)/) : []
  return {
    config: links.filter((link) => link === CONFIG_LINK).length,
    preload: links.filter((link) => link.startsWith('</hero.png>')).length,
  }
}

describe('cache-components-link-header', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function fetchPage(pathname: string) {
    const res = await next.fetch(pathname)
    expect(res.status).toBe(200)
    const $ = load(await res.text())
    return {
      renderedAt: $('#rendered-at').text(),
      links: countLinks(res.headers.get('link')),
    }
  }

  it.each(['/', '/prerendered', '/on-demand'])(
    'emits each Link header once across revalidations of %s',
    async (pathname) => {
      const first = await fetchPage(pathname)
      const counts = [first.links]

      // A revalidation that stores the Link headers already on the response,
      // instead of only the ones it rendered, adds one copy per pass.
      let renderedAt = first.renderedAt
      for (let i = 0; i < 4; i++) {
        const previous = renderedAt
        renderedAt = await retry(async () => {
          const response = await fetchPage(pathname)
          counts.push(response.links)
          expect(response.renderedAt).not.toBe(previous)
          return response.renderedAt
        }, 10_000)
      }

      expect(counts).toEqual(counts.map(() => ({ config: 1, preload: 1 })))
    }
  )
})
