import { type NextInstance, nextTestSetup } from 'e2e-utils'
import type { Response } from 'node-fetch'

async function getLastModifiedTime(next: NextInstance, pathname: string) {
  const content = await (await next.fetch(pathname)).text()
  return content.match(/<lastmod>([^<]+)<\/lastmod>/)[1]
}

function assertSitemapResponse(res: Response) {
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('application/xml')
}

describe('app-dir - dynamic in generate params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should render sitemap with generateSitemaps in force-dynamic config dynamically', async () => {
    const firstTime = await getLastModifiedTime(next, 'sitemap/0.xml')
    const secondTime = await getLastModifiedTime(next, 'sitemap/0.xml')

    expect(firstTime).not.toEqual(secondTime)
  })

  it('should be able to call while generating multiple dynamic sitemaps', async () => {
    const res0 = await next.fetch('sitemap/0.xml')
    const res1 = await next.fetch('sitemap/1.xml')
    assertSitemapResponse(res0)
    assertSitemapResponse(res1)
  })

  it('should be able to call fetch while generating multiple dynamic pages', async () => {
    const pageRes0 = await next.fetch('dynamic/0')
    const pageRes1 = await next.fetch('dynamic/1')
    expect(pageRes0.status).toBe(200)
    expect(pageRes1.status).toBe(200)
  })
})
