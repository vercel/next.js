export default function page() {
  return 'robots'
}

export const metadata = {
  robots: {
    index: false,
    follow: true,
    nocache: true,

    googleBot: {
      index: true,
      follow: false,
      noimageindex: true,

      'max-video-preview': 'standard',
      'max-image-preview': -1,
      'max-snippet': -1,
    },
  },
}
