import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
      {
        userAgent: 'GPTBot',
        allow: '/',
        contentSignal: { search: true, aiInput: false, aiTrain: false },
      },
    ],
    contentSignal: { search: true, aiInput: true, aiTrain: false },
    sitemap: 'https://example.com/sitemap.xml',
  }
}
