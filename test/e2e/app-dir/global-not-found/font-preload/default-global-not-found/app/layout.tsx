import localFont from 'next/font/local'

const layoutFont = localFont({ src: '../fonts/font1_roboto.woff2' })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={layoutFont.className}>{children}</body>
    </html>
  )
}
