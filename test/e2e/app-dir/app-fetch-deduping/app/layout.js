export const fetchCache = 'default-cache'

export default function Layout({ children }) {
  return (
    <html lang="en">
      <head>
        <title>my static site</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
