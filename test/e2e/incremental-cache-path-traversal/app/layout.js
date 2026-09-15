export const metadata = {
  title: 'incremental-cache path traversal repro',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
