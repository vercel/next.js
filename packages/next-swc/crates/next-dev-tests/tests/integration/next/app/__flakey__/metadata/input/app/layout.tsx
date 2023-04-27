export default function RootLayout({ children }: { children: any }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

export const metadata = {
  icons: {
    icon: new URL('./triangle-black.png', import.meta.url).pathname,
  },
  title: {
    absolute: 'RootLayout absolute',
    template: '%s - RootLayout',
  },
}
