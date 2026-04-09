export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

export async function generateMetadata() {
  return {}
}
