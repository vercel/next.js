export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

export async function generateMetadata() {
  return {}
}
