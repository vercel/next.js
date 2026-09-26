import type { MetadataRoute } from 'next'
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
;() => {
  ;({
    rules: {
      userAgent: undefined,
      allow: undefined,
      disallow: undefined,
      crawlDelay: undefined,
      contentSignal: undefined,
    },
    contentSignal: undefined,
    contentSignalsPolicy: undefined,
    sitemap: undefined,
    host: undefined,
  }) satisfies MetadataRoute.Robots
  ;({
    rules: {
      userAgent: '*',
      allow: '/',
      contentSignal: { search: true, aiInput: true, aiTrain: false },
    },
    contentSignal: [
      { path: '/blog', search: true, aiTrain: false },
      { path: ['/docs', '/learn'], search: true, aiInput: true },
    ],
    contentSignalsPolicy: true,
  }) satisfies MetadataRoute.Robots
  ;({
    search: true,
    aiInput: false,
    aiTrain: false,
  }) satisfies MetadataRoute.ContentSignal
  ;({
    path: '/blog',
    search: true,
  }) satisfies MetadataRoute.ContentSignalRule
}
