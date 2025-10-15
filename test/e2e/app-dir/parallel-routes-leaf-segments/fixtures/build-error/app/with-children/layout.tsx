export default function WithChildrenLayout({
  children,
  header,
}: {
  children: React.ReactNode
  header: React.ReactNode
}) {
  return (
    <div>
      <div className="header">{header}</div>
      <div className="container">
        <div className="main">{children}</div>
      </div>
    </div>
  )
}
