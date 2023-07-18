export default function page() {
  return 'icons'
}

export const metadata = {
  icons: {
    icon: [
      { url: '/icon.png' },
      new URL('/icon.png', 'https://example.com'),
      { url: '/icon2.png', rel: 'apple-touch-icon' }, // override icon rel
    ],
    shortcut: ['/shortcut-icon.png'],
    apple: [
      { url: '/apple-icon.png' },
      { url: '/apple-icon-x3.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      {
        rel: 'other-touch-icon',
        url: '/other-touch-icon.png',
      },
    ],
  },
}
