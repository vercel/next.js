import type { MetadataRoute } from 'next'
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
;() => {
  ;({
    rules: {
      userAgent: undefined,
      allow: undefined,
      disallow: undefined,
      crawlDelay: undefined,
    },
    sitemap: undefined,
    host: undefined,
  }) satisfies MetadataRoute.Robots

  // Non-standard directives should be allowed
  ;({
    rules: [
      {
        userAgent: 'SeznamBot',
        allow: '/',
        'Request-Rate': '10/1m',
      },
    ],
  }) satisfies MetadataRoute.Robots
}
