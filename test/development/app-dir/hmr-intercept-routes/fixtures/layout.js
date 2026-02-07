export default function RootLayout({ children, intercept }) {
  return (
    <html lang="en">
      <body>
        {children}
        {intercept}
      </body>
    </html>
  )
}
