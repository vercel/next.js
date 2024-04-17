export default function RootLayout({
  children,
  nav,
}: {
  children: React.ReactNode
  nav: React.ReactNode
}) {
  return (
    <html>
      <head />
      <body>
        <div>{children}</div>
        <div className="nav">{nav}</div>
        <div className="nav">{nav}</div>
      </body>
    </html>
  )
}
