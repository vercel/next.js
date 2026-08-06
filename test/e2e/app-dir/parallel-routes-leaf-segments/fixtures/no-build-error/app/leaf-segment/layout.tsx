export default function LeafLayout({
  children,
  header,
  sidebar,
  metrics,
}: {
  children: React.ReactNode
  header: React.ReactNode
  sidebar: React.ReactNode
  metrics: React.ReactNode
}) {
  return (
    <div>
      <div className="header">{header}</div>
      <div className="container">
        <div className="sidebar">{sidebar}</div>
        <div className="main">
          {children}
          <div className="metrics">{metrics}</div>
        </div>
      </div>
    </div>
  )
}
