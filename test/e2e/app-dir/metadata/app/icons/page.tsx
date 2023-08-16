export default function page() {
  return 'icons'
}

export const metadata = {
  icons: {
    icon: '/icon.png',
    shortcut: '/shortcut-icon.png',
    apple: '/apple-icon.png',
    other: {
      rel: 'other-touch-icon',
      url: '/other-touch-icon.png',
      media: '(prefers-color-scheme: dark)',
    },
  },
}
