import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: 'Googlebot',
        allow: ['/'],
        'Request-Rate': '10/1m',
      },
      {
        userAgent: ['Applebot', 'Bingbot'],
        disallow: ['/'],
        crawlDelay: 2,
        'Visit-time': '0600-0845',
      },
    ],
    sitemap: 'https://example.com/sitemap.xml',
    host: 'https://example.com',
  }
}
