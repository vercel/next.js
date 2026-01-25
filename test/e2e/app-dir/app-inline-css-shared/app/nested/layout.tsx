import './layout.css'

export default function NestedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="nested-layout-wrapper">
      <header className="nested-header">Nested Layout Header</header>
      {children}
    </div>
  )
}
