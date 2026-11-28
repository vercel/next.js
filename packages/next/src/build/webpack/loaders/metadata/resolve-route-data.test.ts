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

    it('should resolve non-standard per-user-agent directives via `other`', () => {
      const data: MetadataRoute.Robots = {
        rules: [
          {
            userAgent: '*',
            allow: '/',
          },
          {
            userAgent: 'SeznamBot',
            allow: '/',
            other: {
              // https://o-seznam.cz/napoveda/vyhledavani/en/crawling-control/
              'Request-Rate': '10/1m',
            },
          },
          {
            userAgent: 'Yandex',
            allow: '/',
            other: {
              'Clean-param': ['ref /articles/', 'utm_source /'],
            },
          },
        ],
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Allow: /

        User-Agent: SeznamBot
        Allow: /
        Request-Rate: 10/1m

        User-Agent: Yandex
        Allow: /
        Clean-param: ref /articles/
        Clean-param: utm_source /

        "
      `)
    })

    it('should resolve a global Content-Signal for the whole file', () => {
      const data: MetadataRoute.Robots = {
        rules: {
          userAgent: '*',
          allow: '/',
        },
        contentSignal: {
          search: true,
          aiTrain: false,
        },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: search=yes, ai-train=no
        Allow: /

        "
      `)
    })

    it('should omit unspecified Content-Signal keys (no preference)', () => {
      const data: MetadataRoute.Robots = {
        rules: { userAgent: '*', allow: '/' },
        contentSignal: { search: true },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: search=yes
        Allow: /

        "
      `)
    })

    it('should emit path-specific Content-Signal lines', () => {
      const data: MetadataRoute.Robots = {
        rules: {
          userAgent: '*',
          allow: '/',
          disallow: '/projects',
        },
        contentSignal: [
          { path: '/blog', search: true, aiTrain: false, aiInput: true },
          { path: '/about', search: true },
          { path: '/projects', search: true, aiTrain: false, aiInput: false },
        ],
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: /blog search=yes, ai-input=yes, ai-train=no
        Content-Signal: /about search=yes
        Content-Signal: /projects search=yes, ai-input=no, ai-train=no
        Allow: /
        Disallow: /projects

        "
      `)
    })

    it('should expand an array of paths into one Content-Signal line each', () => {
      const data: MetadataRoute.Robots = {
        rules: { userAgent: '*', allow: '/' },
        contentSignal: {
          path: ['/blog', '/docs'],
          search: true,
          aiTrain: false,
        },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: /blog search=yes, ai-train=no
        Content-Signal: /docs search=yes, ai-train=no
        Allow: /

        "
      `)
    })

    it('should not merge rule-level keys with the file-level default', () => {
      const data: MetadataRoute.Robots = {
        contentSignal: { search: true, aiTrain: false },
        rules: [
          { userAgent: '*', allow: '/' },
          {
            userAgent: 'GPTBot',
            allow: '/',
            contentSignal: { aiInput: false },
          },
        ],
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: search=yes, ai-train=no
        Allow: /

        User-Agent: GPTBot
        Content-Signal: ai-input=no
        Allow: /

        "
      `)
    })

    it('should copy the file-level contentSignal into every group that does not override', () => {
      const data: MetadataRoute.Robots = {
        contentSignal: { search: true, aiTrain: false },
        rules: [
          { userAgent: '*', allow: '/' },
          { userAgent: 'Googlebot', allow: '/' },
        ],
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: search=yes, ai-train=no
        Allow: /

        User-Agent: Googlebot
        Content-Signal: search=yes, ai-train=no
        Allow: /

        "
      `)
    })

    it('should let a rule-level contentSignal replace the file-level default', () => {
      const data: MetadataRoute.Robots = {
        contentSignal: { search: true, aiTrain: false },
        rules: [
          { userAgent: '*', allow: '/' },
          {
            userAgent: 'GPTBot',
            allow: '/',
            contentSignal: {
              search: true,
              aiInput: false,
              aiTrain: false,
            },
          },
        ],
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: search=yes, ai-train=no
        Allow: /

        User-Agent: GPTBot
        Content-Signal: search=yes, ai-input=no, ai-train=no
        Allow: /

        "
      `)
    })

    it('should emit independent Content-Signal blocks when two named agents have no file-level default', () => {
      const data: MetadataRoute.Robots = {
        rules: [
          {
            userAgent: 'Googlebot',
            allow: '/',
            contentSignal: { search: true },
          },
          {
            userAgent: 'GPTBot',
            allow: '/',
            contentSignal: { aiTrain: false },
          },
          {
            userAgent: 'Bingbot',
            allow: '/',
          },
        ],
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: Googlebot
        Content-Signal: search=yes
        Allow: /

        User-Agent: GPTBot
        Content-Signal: ai-train=no
        Allow: /

        User-Agent: Bingbot
        Allow: /

        "
      `)
    })

    it('should omit explicitly undefined Content-Signal keys', () => {
      const data: MetadataRoute.Robots = {
        rules: { userAgent: '*', allow: '/' },
        contentSignal: {
          search: undefined,
          aiInput: true,
          aiTrain: false,
        },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: ai-input=yes, ai-train=no
        Allow: /

        "
      `)
    })

    it('should not emit the policy comment when contentSignalsPolicy is false', () => {
      const data: MetadataRoute.Robots = {
        contentSignalsPolicy: false,
        contentSignal: { search: true },
        rules: { userAgent: '*', allow: '/' },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: search=yes
        Allow: /

        "
      `)
    })

    it('should skip empty strings in a path array', () => {
      const data: MetadataRoute.Robots = {
        rules: { userAgent: '*', allow: '/' },
        contentSignal: {
          path: ['/blog', ''],
          search: true,
          aiTrain: false,
        },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: /blog search=yes, ai-train=no
        Allow: /

        "
      `)
    })

    it('should skip null holes in a path array instead of emitting a site-wide line', () => {
      const data: MetadataRoute.Robots = {
        rules: { userAgent: '*', allow: '/' },
        contentSignal: {
          // @ts-expect-error intentionally testing non-string holes
          path: ['/blog', null, undefined],
          search: true,
        },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: /blog search=yes
        Allow: /

        "
      `)
    })

    it('should not emit a Content-Signal line for a path with no boolean keys', () => {
      const data: MetadataRoute.Robots = {
        rules: { userAgent: '*', allow: '/' },
        contentSignal: { path: '/blog' },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Allow: /

        "
      `)
    })

    it('should not emit a Content-Signal line for an empty object (opt out of global)', () => {
      const data: MetadataRoute.Robots = {
        contentSignal: { search: true, aiTrain: false },
        rules: [
          { userAgent: '*', allow: '/' },
          { userAgent: 'Googlebot', allow: '/', contentSignal: {} },
        ],
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: search=yes, ai-train=no
        Allow: /

        User-Agent: Googlebot
        Allow: /

        "
      `)
    })

    it('should serialize all three signals as yes', () => {
      const data: MetadataRoute.Robots = {
        rules: { userAgent: '*', allow: '/' },
        contentSignal: { search: true, aiInput: true, aiTrain: true },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: search=yes, ai-input=yes, ai-train=yes
        Allow: /

        "
      `)
    })

    it('should prepend the Content Signals Policy comment when enabled', () => {
      const data: MetadataRoute.Robots = {
        contentSignalsPolicy: true,
        contentSignal: { search: true, aiTrain: false },
        rules: { userAgent: '*', allow: '/' },
        sitemap: 'https://example.com/sitemap.xml',
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "# As a condition of accessing this website, you agree to abide by the following content signals:
        #
        # (a)  If a content-signal = yes, you may collect content for the corresponding use.
        # (b)  If a content-signal = no, you may not collect content for the corresponding use.
        # (c)  If the website operator does not include a content signal for a corresponding use, the website operator neither grants nor restricts permission via content signal with respect to the corresponding use.
        #
        # The content signals and their meanings are:
        #
        # search: building a search index and providing search results (e.g., returning hyperlinks and short excerpts from your website's contents).  Search does not include providing AI-generated search summaries.
        # ai-input: inputting content into one or more AI models (e.g., retrieval augmented generation, grounding, or other real-time taking of content for generative AI search answers).
        # ai-train: training or fine-tuning AI models.
        #
        # ANY RESTRICTIONS EXPRESSED VIA CONTENT SIGNALS ARE EXPRESS RESERVATIONS OF RIGHTS UNDER ARTICLE 4 OF THE EUROPEAN UNION DIRECTIVE 2019/790 ON COPYRIGHT AND RELATED RIGHTS IN THE DIGITAL SINGLE MARKET.

        User-Agent: *
        Content-Signal: search=yes, ai-train=no
        Allow: /

        Sitemap: https://example.com/sitemap.xml
        "
      `)
    })

    it('should emit only ai-input when that is the sole key', () => {
      const data: MetadataRoute.Robots = {
        rules: { userAgent: '*', allow: '/' },
        contentSignal: { aiInput: false },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: ai-input=no
        Allow: /

        "
      `)
    })

    it('should emit only ai-train when that is the sole key', () => {
      const data: MetadataRoute.Robots = {
        rules: { userAgent: '*', allow: '/' },
        contentSignal: { aiTrain: true },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: ai-train=yes
        Allow: /

        "
      `)
    })

    it('should allow pathless and path-specific signals in one array', () => {
      const data: MetadataRoute.Robots = {
        rules: { userAgent: '*', allow: '/' },
        contentSignal: [
          { search: true, aiTrain: false },
          { path: '/blog', aiInput: true },
        ],
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: search=yes, ai-train=no
        Content-Signal: /blog ai-input=yes
        Allow: /

        "
      `)
    })

    it('should preserve array order when a path rule comes before a pathless rule', () => {
      const data: MetadataRoute.Robots = {
        rules: { userAgent: '*', allow: '/' },
        contentSignal: [
          { path: '/a', search: true },
          { search: true, aiTrain: false },
        ],
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: /a search=yes
        Content-Signal: search=yes, ai-train=no
        Allow: /

        "
      `)
    })

    it('should treat an empty path array as pathless', () => {
      const data: MetadataRoute.Robots = {
        rules: { userAgent: '*', allow: '/' },
        contentSignal: { path: [], search: true, aiTrain: false },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: search=yes, ai-train=no
        Allow: /

        "
      `)
    })

    it('should prepend the policy comment even without contentSignal lines', () => {
      const data: MetadataRoute.Robots = {
        contentSignalsPolicy: true,
        rules: { userAgent: '*', allow: '/' },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "# As a condition of accessing this website, you agree to abide by the following content signals:
        #
        # (a)  If a content-signal = yes, you may collect content for the corresponding use.
        # (b)  If a content-signal = no, you may not collect content for the corresponding use.
        # (c)  If the website operator does not include a content signal for a corresponding use, the website operator neither grants nor restricts permission via content signal with respect to the corresponding use.
        #
        # The content signals and their meanings are:
        #
        # search: building a search index and providing search results (e.g., returning hyperlinks and short excerpts from your website's contents).  Search does not include providing AI-generated search summaries.
        # ai-input: inputting content into one or more AI models (e.g., retrieval augmented generation, grounding, or other real-time taking of content for generative AI search answers).
        # ai-train: training or fine-tuning AI models.
        #
        # ANY RESTRICTIONS EXPRESSED VIA CONTENT SIGNALS ARE EXPRESS RESERVATIONS OF RIGHTS UNDER ARTICLE 4 OF THE EUROPEAN UNION DIRECTIVE 2019/790 ON COPYRIGHT AND RELATED RIGHTS IN THE DIGITAL SINGLE MARKET.

        User-Agent: *
        Allow: /

        "
      `)
    })

    it('should allow Content-Signal on a disallow-only rule', () => {
      const data: MetadataRoute.Robots = {
        rules: {
          userAgent: '*',
          disallow: '/private/',
          contentSignal: { search: false, aiInput: false, aiTrain: false },
        },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: search=no, ai-input=no, ai-train=no
        Disallow: /private/

        "
      `)
    })

    it('should keep multiple sitemaps after Content-Signal groups', () => {
      const data: MetadataRoute.Robots = {
        rules: { userAgent: '*', allow: '/' },
        contentSignal: { search: true },
        sitemap: [
          'https://example.com/sitemap.xml',
          'https://example.com/blog.xml',
        ],
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: search=yes
        Allow: /

        Sitemap: https://example.com/sitemap.xml
        Sitemap: https://example.com/blog.xml
        "
      `)
    })

    it('should emit Content-Signal with crawlDelay and other on the same rule', () => {
      const data: MetadataRoute.Robots = {
        rules: {
          userAgent: 'SeznamBot',
          allow: '/',
          crawlDelay: 2,
          contentSignal: { search: true, aiTrain: false },
          other: { 'Request-Rate': '10/1m' },
        },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: SeznamBot
        Content-Signal: search=yes, ai-train=no
        Allow: /
        Crawl-delay: 2
        Request-Rate: 10/1m

        "
      `)
    })

    it('should emit one Content-Signal block after every User-Agent line in a rule', () => {
      const data: MetadataRoute.Robots = {
        rules: {
          userAgent: ['Applebot', 'Bingbot'],
          allow: '/',
          contentSignal: { search: true, aiTrain: false },
        },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: Applebot
        User-Agent: Bingbot
        Content-Signal: search=yes, ai-train=no
        Allow: /

        "
      `)
    })

    it('should keep Host and Sitemap after groups when Content-Signal is present', () => {
      const data: MetadataRoute.Robots = {
        rules: { userAgent: '*', allow: '/', crawlDelay: 1 },
        contentSignal: { search: true, aiInput: true, aiTrain: false },
        host: 'https://example.com',
        sitemap: 'https://example.com/sitemap.xml',
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: *
        Content-Signal: search=yes, ai-input=yes, ai-train=no
        Allow: /
        Crawl-delay: 1

        Host: https://example.com
        Sitemap: https://example.com/sitemap.xml
        "
      `)
    })

    it('should skip null/undefined entries in `other`', () => {
      const data: MetadataRoute.Robots = {
        rules: {
          userAgent: 'SeznamBot',
          allow: '/',
          other: {
            'Request-Rate': '10/1m',
            // @ts-expect-error intentionally testing null handling
            'Visit-time': null,
            // @ts-expect-error intentionally testing undefined handling
            'Clean-param': undefined,
          },
        },
      }

      expect(resolveRobots(data)).toMatchInlineSnapshot(`
        "User-Agent: SeznamBot
        Allow: /
        Request-Rate: 10/1m

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
