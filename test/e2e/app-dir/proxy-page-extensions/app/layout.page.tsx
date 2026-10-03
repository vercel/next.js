export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>proxy-page-extensions</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
