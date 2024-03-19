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

    it('should generate multiple sitemaps', async () => {
      expect(
        (await next.fetch(isNextDev ? 'sitemap.xml/0' : '/sitemap/0.xml'))
          .status
      ).toBe(200)
      expect(
        (await next.fetch(isNextDev ? 'sitemap.xml/1' : '/sitemap/1.xml'))
          .status
      ).toBe(200)
    })
  }
)
