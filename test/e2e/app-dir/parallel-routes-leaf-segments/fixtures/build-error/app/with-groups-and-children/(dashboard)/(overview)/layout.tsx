export default function GroupedWithChildrenLayout({
  children,
  metrics,
}: {
  children: React.ReactNode
  metrics: React.ReactNode
}) {
  return (
    <div>
      <h2>Parent with Route Groups</h2>
      <div className="grouped-container">
        <div className="main">{children}</div>
        <div className="metrics">{metrics}</div>
      </div>
    </div>
  )
}
