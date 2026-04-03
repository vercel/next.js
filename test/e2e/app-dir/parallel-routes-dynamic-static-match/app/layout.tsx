export default function RootLayout({
  children,
  parallel,
}: {
  children: React.ReactNode
  parallel: React.ReactNode
}) {
  return (
    <html>
      <body>
        <div id="children">{children}</div>
        <div id="parallel">{parallel}</div>
      </body>
    </html>
  )
}
