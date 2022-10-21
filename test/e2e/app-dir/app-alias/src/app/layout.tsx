export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head></head>
      <body>{children}</body>
    </html>
  )
}
