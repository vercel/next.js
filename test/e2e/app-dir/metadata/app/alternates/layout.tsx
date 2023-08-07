export default function layout({ children }) {
  return children
}

export const metadata = {
  metadataBase: 'https://example.com',
  alternates: {
    canonical: './',
    languages: {
      'en-US': './en-US',
      'de-DE': './de-DE',
    },
  },
}
