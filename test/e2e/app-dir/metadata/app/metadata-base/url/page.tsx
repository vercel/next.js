export default function page() {
  return 'url'
}

export const metadata = {
  metadataBase: new URL('https://bar.example/url'),
  alternates: {
    canonical: 'subpath',
  },
}
