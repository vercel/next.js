export default function Page() {
  return 'alternate'
}

export async function generateMetadata(props, parentResolvingMetadata) {
  const parentMetadata = await parentResolvingMetadata

  return {
    ...parentMetadata,
    alternates: {
      ...parentMetadata.alternates,
      languages: {
        'en-US': 'https://example.com/en-US',
        'de-DE': 'https://example.com/de-DE',
      },
      media: {
        'only screen and (max-width: 600px)': '/mobile',
      },
      types: {
        'application/rss+xml': [
          { url: '/blog.rss', title: 'rss' },
          { url: '/blog/js.rss', title: 'js title' },
        ],
      },
    },
  }
}
