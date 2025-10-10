import '../globals.css'
import '../font2.css'

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'var(--font-sans)' }}>{children}</body>
    </html>
  )
}
