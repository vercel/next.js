export default function Page() {
  return 'metadata base opengraph page'
}

export const metadata = {
  metadataBase: new URL('https://acme.com'),
  openGraph: {
    images: '/og-image.png',
  },
}
