import type { RobotsFile } from 'next'

export default function robots(): RobotsFile {
  return {
    rules: [
      {
        userAgent: 'Googlebot',
        allow: ['/'],
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
