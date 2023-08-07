export default function RootLayout({ children }: { children: any }) {
  return (
    <html>
      <body>
        <h1>RootLayout</h1>
        {children}
      </body>
    </html>
  )
}
