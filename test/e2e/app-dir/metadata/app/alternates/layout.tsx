export default function layout({ children }) {
  return children
}

export const metadata = {
  metadataBase: 'https://example.com',
  alternates: {
    canonical: { url: './', title: 'Canonical page' },
    languages: {
      'en-US': './en-US',
      'de-DE': './de-DE',
    },
  },
}
