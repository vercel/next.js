import type { MetadataRoute } from 'next'

export default function llms(): MetadataRoute.Llms {
  return {
    title: 'My Site',
    description: 'A description of my site',
    details: 'Some additional details about the site.',
    sections: [
      {
        heading: 'Docs',
        description: 'Documentation section',
        links: [
          {
            title: 'Getting Started',
            url: 'https://example.com/docs/getting-started',
            description: 'Learn how to get started',
          },
          {
            title: 'API Reference',
            url: 'https://example.com/docs/api',
          },
        ],
      },
      {
        heading: 'Blog',
        links: [
          {
            title: 'Latest Post',
            url: 'https://example.com/blog/latest',
            description: 'Read the latest post',
          },
        ],
      },
    ],
  }
}
