export default function Root({ children }) {
  return (
    <html lang="en">
      <head>
        <title>My Title</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
