export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <header>
          <nav>
            <a href="/" className="inline-block border px-4 py-2">
              Home
            </a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
