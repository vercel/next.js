export default function Layout({ children }) {
  return (
    <div>
      <h3>Nested Layout</h3>
      <div className="nested-children">{children}</div>
    </div>
  )
}
