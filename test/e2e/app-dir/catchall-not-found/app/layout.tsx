export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <h1>Layout</h1>
        {children}
      </body>
    </html>
  )
}
