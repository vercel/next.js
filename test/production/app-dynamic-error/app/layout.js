export default function Layout({ children }) {
  return (
    <html lang="en">
      <head>
        <title>my static blog</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
