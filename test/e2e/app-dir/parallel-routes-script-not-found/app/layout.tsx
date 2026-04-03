export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: 'window.__LAYOUT_SCRIPT_RAN = true',
          }}
        />
        {children}
        {modal}
      </body>
    </html>
  )
}
