export default function Page() {
  return 'hello'
}

export const metadata = {
  alternates: {
    canonical: 'https://example.com',
    languages: {
      'en-US': 'https://example.com/en-US',
      'de-DE': 'https://example.com/de-DE',
    },
    media: {
      'only screen and (max-width: 600px)': '/mobile',
    },
    types: {
      'application/rss+xml': 'https://example.com/rss',
    },
  },
}
