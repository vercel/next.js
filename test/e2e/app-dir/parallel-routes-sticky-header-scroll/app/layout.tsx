export default function RootLayout({
  children,
  header,
}: {
  children: React.ReactNode
  header: React.ReactNode
}) {
  return (
    <html>
      <body>
        <div
          style={{
            position: 'sticky',
            top: 0,
            background: 'white',
            zIndex: 100,
            borderBottom: '1px solid #ccc',
            padding: '10px',
          }}
          id="sticky-header"
        >
          {header}
        </div>
        <main>{children}</main>
      </body>
    </html>
  )
}
