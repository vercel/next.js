export default function GroupedLeafLayout({
  children,
  analytics,
  reports,
}: {
  children: React.ReactNode
  analytics: React.ReactNode
  reports: React.ReactNode
}) {
  return (
    <div>
      <h2>Leaf with Route Groups</h2>
      <div className="grouped-container">
        <div className="analytics">{analytics}</div>
        <div className="main">{children}</div>
        <div className="reports">{reports}</div>
      </div>
    </div>
  )
}
