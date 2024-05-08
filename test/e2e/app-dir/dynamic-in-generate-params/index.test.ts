import { type NextInstance, nextTestSetup } from 'e2e-utils'

async function getLastModifiedTime(next: NextInstance, pathname: string) {
  const content = await (await next.fetch(pathname)).text()
  return content.match(/<lastmod>([^<]+)<\/lastmod>/)[1]
}

describe('app-dir - dynamic in generate params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render sitemap with generateSitemaps in force-dynamic config dynamically', async () => {
    const firstTime = await getLastModifiedTime(next, 'sitemap/0')
    const secondTime = await getLastModifiedTime(next, 'sitemap/0')

    expect(firstTime).not.toEqual(secondTime)
  })

  it('should be able to call while generating multiple dynamic sitemaps', async () => {
    expect((await next.fetch('sitemap/0')).status).toBe(200)
    expect((await next.fetch('sitemap/1')).status).toBe(200)
  })

  it('should be able to call fetch while generating multiple dynamic pages', async () => {
    expect((await next.fetch('/dynamic/0')).status).toBe(200)
    expect((await next.fetch('/dynamic/1')).status).toBe(200)
  })
})
