import type { MetadataRoute } from '../../../../lib/metadata/types/metadata-interface'
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
      const data1: MetadataRoute.Robots = {
        rules: [
          // @ts-expect-error userAgent is required for Array<Robots>
          {
            allow: '/',
          },
          {
            userAgent: 'Googlebot',
            allow: ['/bot', '/bot2'],
          },
        ],
      }

      const data2: MetadataRoute.Robots = {
        rules: {
          // Can skip userAgent for single Robots
          allow: '/',
        },
      }

      const data3: MetadataRoute.Robots = {
        rules: { allow: '/' },
      }

      expect(resolveRobots(data1)).toMatchInlineSnapshot(`
        "User-Agent: *
        Allow: /

        User-Agent: Googlebot
        Allow: /bot
        Allow: /bot2

        "
      `)

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
            changeFrequency: 'weekly',
            priority: 0.5,
          },
        ])
      ).toMatchInlineSnapshot(`
        "<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
        <loc>https://example.com</loc>
        <lastmod>2021-01-01</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.5</priority>
        </url>
        </urlset>
        "
      `)
    })
    it('should resolve sitemap.xml with alternates', () => {
      expect(
        resolveSitemap([
          {
            url: 'https://example.com',
            lastModified: '2021-01-01',
            alternates: {
              languages: {
                es: 'https://example.com/es',
                de: 'https://example.com/de',
              },
            },
          },
        ])
      ).toMatchInlineSnapshot(`
        "<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
        <url>
        <loc>https://example.com</loc>
        <xhtml:link rel="alternate" hreflang="es" href="https://example.com/es" />
        <xhtml:link rel="alternate" hreflang="de" href="https://example.com/de" />
        <lastmod>2021-01-01</lastmod>
        </url>
        </urlset>
        "
      `)
    })
    it('should resolve sitemap.xml with images', () => {
      expect(
        resolveSitemap([
          {
            url: 'https://example.com',
            lastModified: '2021-01-01',
            changeFrequency: 'weekly',
            priority: 0.5,
            images: ['https://example.com/image.jpg'],
          },
        ])
      ).toMatchInlineSnapshot(`
        "<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
        <url>
        <loc>https://example.com</loc>
        <image:image>
        <image:loc>https://example.com/image.jpg</image:loc>
        </image:image>
        <lastmod>2021-01-01</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.5</priority>
        </url>
        </urlset>
        "
      `)
    })
    it('should resolve sitemap.xml with videos', () => {
      expect(
        resolveSitemap([
          {
            url: 'https://example.com',
            lastModified: '2021-01-01',
            changeFrequency: 'weekly',
            priority: 0.5,
            videos: [
              {
                title: 'example',
                thumbnail_loc: 'https://example.com/image.jpg',
                description: 'this is the description',
                content_loc: 'http://streamserver.example.com/video123.mp4',
                player_loc: 'https://www.example.com/videoplayer.php?video=123',
                duration: 2,
                view_count: 50,
                tag: 'summer',
                rating: 4,
                expiration_date: '2025-09-16',
                publication_date: '2024-09-16',
                family_friendly: 'yes',
                requires_subscription: 'no',
                live: 'no',
                restriction: {
                  relationship: 'allow',
                  content: 'IE GB US CA',
                },
                platform: {
                  relationship: 'allow',
                  content: 'web',
                },
                uploader: {
                  info: 'https://www.example.com/users/grillymcgrillerson',
                  content: 'GrillyMcGrillerson',
                },
              },
            ],
          },
        ])
      ).toMatchInlineSnapshot(`
        "<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
        <url>
        <loc>https://example.com</loc>
        <video:video>
        <video:title>example</video:title>
        <video:thumbnail_loc>https://example.com/image.jpg</video:thumbnail_loc>
        <video:description>this is the description</video:description>
        <video:content_loc>http://streamserver.example.com/video123.mp4</video:content_loc>
        <video:player_loc>https://www.example.com/videoplayer.php?video=123</video:player_loc>
        <video:duration>2</video:duration>
        <video:view_count>50</video:view_count>
        <video:tag>summer</video:tag>
        <video:rating>4</video:rating>
        <video:expiration_date>2025-09-16</video:expiration_date>
        <video:publication_date>2024-09-16</video:publication_date>
        <video:family_friendly>yes</video:family_friendly>
        <video:requires_subscription>no</video:requires_subscription>
        <video:live>no</video:live>
        <video:restriction relationship="allow">IE GB US CA</video:restriction>
        <video:platform relationship="allow">web</video:platform>
        <video:uploader info="https://www.example.com/users/grillymcgrillerson">GrillyMcGrillerson</video:uploader>
        </video:video>
        <lastmod>2021-01-01</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.5</priority>
        </url>
        </urlset>
        "
      `)
    })
  })
})
