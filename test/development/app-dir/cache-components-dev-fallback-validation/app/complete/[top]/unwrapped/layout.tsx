export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ top: string }>
}) {
  await params
  return children
}
