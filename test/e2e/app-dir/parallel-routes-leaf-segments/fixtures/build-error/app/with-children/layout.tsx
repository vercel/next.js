export default function WithChildrenLayout({
  children,
  header,
  sidebar,
}: {
  children: React.ReactNode
  header: React.ReactNode
  sidebar: React.ReactNode
}) {
  return (
    <div>
      <div className="header">{header}</div>
      <div className="container">
        <div className="sidebar">{sidebar}</div>
        <div className="main">{children}</div>
      </div>
    </div>
  )
}
