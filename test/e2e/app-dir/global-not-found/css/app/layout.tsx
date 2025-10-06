import './global.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
      <footer>
        <p className="orange-text">layout footer orange text</p>
      </footer>
    </html>
  )
}
