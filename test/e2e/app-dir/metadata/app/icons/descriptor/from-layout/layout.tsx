export default function layout({ children }) {
  return children
}

export const metadata = {
  icons: [
    {
      url: 'favicon-light.png',
      rel: 'icon',
      media: '(prefers-color-scheme: light)',
    },
    {
      url: 'favicon-dark.png',
      rel: 'icon',
      media: '(prefers-color-scheme: dark)',
    },
  ],
}
