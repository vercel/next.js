import type { MetadataRoute } from 'next'
import type { NextRequest } from 'next/server'

export default function robots(req: NextRequest): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: 'Googlebot',
        allow: ['/', req.nextUrl.pathname],
      },
      {
        userAgent: ['Applebot', 'Bingbot'],
        disallow: ['/'],
        crawlDelay: 2,
      },
    ],
    sitemap: 'https://example.com/sitemap.xml',
    host: 'https://example.com',
  }
}
