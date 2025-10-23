export default function CatchAllLayout({
  children,
  header,
  footer,
}: {
  children: React.ReactNode
  header: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <div className="catch-all-container">
      <div className="header">{header}</div>
      <div className="main">{children}</div>
      <div className="footer">{footer}</div>
    </div>
  )
}
