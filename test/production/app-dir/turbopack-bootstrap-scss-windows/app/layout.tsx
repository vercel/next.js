import './globals.scss'

export const metadata = {
  title: 'Bootstrap SCSS Test',
  description: 'Test Bootstrap SCSS imports with Turbopack',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
