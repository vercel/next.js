export default function Page() {
  return 'alternate'
}

export async function generateMetadata(props, parentResolvingMetadata) {
  const parentMetadata = await parentResolvingMetadata

  return {
    ...parentMetadata,
    alternates: {
      ...parentMetadata.alternates,
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
