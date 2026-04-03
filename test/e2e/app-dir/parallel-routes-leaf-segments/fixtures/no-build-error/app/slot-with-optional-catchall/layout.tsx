export default function Layout({
  children,
  breadcrumbs,
}: {
  children: React.ReactNode
  breadcrumbs: React.ReactNode
}) {
  return (
    <div className="optional-catchall-container">
      <div className="breadcrumbs">{breadcrumbs}</div>
      <div className="main">{children}</div>
    </div>
  )
}
