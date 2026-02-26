import type { MetadataRoute } from 'next'
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
;() => {
  // String form
  '# My Site' satisfies MetadataRoute.Llms

  // Object form
  ;({
    title: 'My Site',
    description: undefined,
    details: undefined,
    sections: [
      {
        heading: 'Docs',
        description: undefined,
        links: [
          {
            title: 'Getting Started',
            url: 'https://example.com/docs',
            description: undefined,
          },
        ],
      },
    ],
  }) satisfies MetadataRoute.Llms
}
