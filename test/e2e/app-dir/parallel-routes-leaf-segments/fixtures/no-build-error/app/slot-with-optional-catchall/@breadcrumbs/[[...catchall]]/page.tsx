export default async function Page({
  params,
}: {
  params: Promise<{ catchall?: string[] }>
}) {
  const { catchall } = await params
  return (
    <nav className="breadcrumbs-content">
      <h3>Breadcrumbs</h3>
      <p>Path: /{catchall ? catchall.join('/') : ''}</p>
    </nav>
  )
}
