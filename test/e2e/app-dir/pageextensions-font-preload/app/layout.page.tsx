import localFont from 'next/font/local'

const myFont = localFont({
  src: '../fonts/font1_roboto.woff2',
  variable: '--font-my-font',
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
