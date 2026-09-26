import { Nav } from './nav'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  )
}
