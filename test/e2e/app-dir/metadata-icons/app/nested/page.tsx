export default function Page() {
  return <p>hello world</p>
}

export const metadata = {
  icons: {
    shortcut: '/shortcut-icon-nested.png',
    apple: '/apple-icon-nested.png',
    other: {
      rel: 'apple-touch-icon-precomposed-nested',
      url: '/apple-touch-icon-precomposed-nested.png',
    },
  },
}
