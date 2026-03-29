export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
        <footer id="footer">Footer Content</footer>
      </body>
    </html>
  )
}
