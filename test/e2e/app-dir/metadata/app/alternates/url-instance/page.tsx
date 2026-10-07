export default function Page() {
  return <p id="alternates-url-instance">alternate url instance</p>
}

export const metadata = {
  metadataBase: new URL('https://example.com'),
  alternates: {
    canonical: new URL('https://example.com/alternates/url-instance'),
    languages: {
      'en-US': new URL('https://example.com/us/alternates/url-instance'),
      'de-DE': new URL('/de/alternates/url-instance', 'https://example.com'),
    },
  },
}
