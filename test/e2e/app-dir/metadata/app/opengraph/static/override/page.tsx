export default function Page() {
  return 'opengraph-static-override'
}

export const metadata = {
  icons: ['https://custom-icon-1.png'],
  openGraph: {
    title: 'no-og-image',
    images: undefined,
  },
  twitter: {
    title: 'no-tw-image',
    images: null,
  },
}
