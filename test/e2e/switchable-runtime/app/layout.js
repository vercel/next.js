export const revalidate = 0

export default function Root({ children }) {
  return (
    <html lang="en">
      <head>
        <title>switchable runtime</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
