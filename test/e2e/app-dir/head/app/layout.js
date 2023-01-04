export default function Root({ children }) {
  return (
    <html lang="en">
      <head>
        <script async src="/another.js" />
      </head>
      <body>{children}</body>
    </html>
  )
}
