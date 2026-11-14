import localFont from 'next/font/local'

const myFont = localFont({
  src: '../fonts/my-font.woff2',
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={myFont.className}>{children}</body>
    </html>
  )
}
