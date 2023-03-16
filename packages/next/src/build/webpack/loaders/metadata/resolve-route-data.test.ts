import type { RobotsFile } from '../../../../lib/metadata/types/metadata-interface'
import { resolveRobots, resolveSitemap } from './resolve-route-data'

describe('resolveRouteData', () => {
  describe('resolveRobots', () => {
    it('should resolve robots.txt', () => {
      const data = {
        host: 'https://example.com',
        sitemap: 'https://example.com/sitemap.xml',
        rules: [
          {
            userAgent: 'Googlebot',
            allow: '/',
            disallow: '/admin',
            crawlDelay: 2,
          },
        ],
      }
      const content = resolveRobots(data)
      expect(content).toMatchInlineSnapshot(`
        "User-Agent: Googlebot
        Allow: /
        Disallow: /admin
        Crawl-delay: 2

        Host: https://example.com
        Sitemap: https://example.com/sitemap.xml
        "
      `)
    })

    it('should error with ts when specify both wildcard userAgent and specific userAgent', () => {
      const data1: RobotsFile = {
        rules: [
          // @ts-expect-error userAgent is required for Array<Robots>
          {
            allow: '/',
          },
          {
            userAgent: 'Googlebot',
            allow: '/bot',
          },
        ],
      }

      const data2: RobotsFile = {
        rules: {
          // @ts-expect-error When apply only 1 rule, only '*' or undefined is allowed
          userAgent: 'Somebot',
          allow: '/',
        },
      }

      const data3: RobotsFile = {
        rules: { allow: '/' },
      }

      resolveRobots(data1)
      resolveRobots(data2)
      expect(resolveRobots(data3)).toMatchInlineSnapshot(`
        "User-Agent: *
        Allow: /

        "
      `)
    })
  })

  describe('resolveSitemap', () => {
    it('should resolve sitemap.xml', () => {
      expect(
        resolveSitemap([
          {
            url: 'https://example.com',
            lastModified: '2021-01-01',
          },
        ])
      ).toMatchInlineSnapshot(`
        "<?xml version=\\"1.0\\" encoding=\\"UTF-8\\"?>
        <urlset xmlns=\\"http://www.sitemaps.org/schemas/sitemap/0.9\\">
        <url>
        <loc>https://example.com</loc>
        <lastmod>2021-01-01</lastmod>
        </url>
        </urlset>
        "
      `)
    })
  })
})
