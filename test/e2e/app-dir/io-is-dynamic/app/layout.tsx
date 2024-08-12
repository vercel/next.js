export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <div id="sentinel">{process.env.__TEST_SENTINEL}</div>
      </body>
    </html>
  )
}
