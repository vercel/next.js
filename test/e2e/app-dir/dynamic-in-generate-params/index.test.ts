import { type NextInstance, createNextDescribe } from 'e2e-utils'

async function getLastModifiedTime(next: NextInstance, pathname: string) {
  const content = await (await next.fetch(pathname)).text()
  return content.match(/<lastmod>([^<]+)<\/lastmod>/)[1]
}

createNextDescribe(
  'app-dir - dynamic in generate params',
  {
    files: __dirname,
  },
  ({ next, isNextDev }) => {
    it('should render sitemap with generateSitemaps in force-dynamic config dynamically', async () => {
      const firstTime = await getLastModifiedTime(
        next,
        isNextDev ? 'sitemap.xml/0' : '/sitemap/0.xml'
      )
      const secondTime = await getLastModifiedTime(
        next,
        isNextDev ? 'sitemap.xml/0' : '/sitemap/0.xml'
      )

      expect(firstTime).not.toEqual(secondTime)
    })

    it('should be able to call while generating multiple dynamic sitemaps', async () => {
      expect(
        (await next.fetch(isNextDev ? 'sitemap.xml/0' : '/sitemap/0.xml'))
          .status
      ).toBe(200)
      expect(
        (await next.fetch(isNextDev ? 'sitemap.xml/1' : '/sitemap/1.xml'))
          .status
      ).toBe(200)
    })

    it('should be able to call fetch while generating multiple dynamic pages', async () => {
      expect((await next.fetch('/dynamic/0')).status).toBe(200)
      expect((await next.fetch('/dynamic/1')).status).toBe(200)
    })
  }
)
