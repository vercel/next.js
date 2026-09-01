__turbopack_emit__('./layout-target.js', {
  namespace: 'my-test',
  data: 'data-for-layout',
})

export default function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
