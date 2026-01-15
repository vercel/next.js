export default function Layout({ children }) {
  return (
    <html lang="en">
      <head>
        <title>Fetch Memory Leak Test</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
