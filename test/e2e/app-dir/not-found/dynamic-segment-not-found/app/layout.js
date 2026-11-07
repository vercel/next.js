export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head />
      <body>
        <header id="site-header">Site Header</header>
        <main>{children}</main>
      </body>
    </html>
  )
}
