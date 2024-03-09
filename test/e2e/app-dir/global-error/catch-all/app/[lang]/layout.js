export default async function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

export const dynamic = 'force-dynamic'
