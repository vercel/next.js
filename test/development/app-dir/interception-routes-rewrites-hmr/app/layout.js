export default function RootLayout({ children, slot }) {
  return (
    <html>
      <body>
        <main id="children">{children}</main>
        <aside id="slot">{slot}</aside>
      </body>
    </html>
  )
}
