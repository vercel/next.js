export function generateStaticParams() {
  return [{ top: 'prerendered' }]
}

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
