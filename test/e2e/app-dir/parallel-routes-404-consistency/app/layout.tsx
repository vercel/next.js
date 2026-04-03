export default function RootLayout({
  children,
  breadcrumb,
}: {
  children: React.ReactNode
  breadcrumb: React.ReactNode
}) {
  return (
    <html>
      <body>
        <div id="breadcrumb">{breadcrumb}</div>
        <div id="children">{children}</div>
      </body>
    </html>
  )
}
