export default function RootLayout({
  children,
  header,
  secondary,
}: {
  children: React.ReactNode
  header: React.ReactNode
  secondary: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {header}
        {secondary}
        {children}
      </body>
    </html>
  )
}
