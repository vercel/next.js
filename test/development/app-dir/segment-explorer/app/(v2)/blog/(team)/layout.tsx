export default function Layout({ children }) {
  return (
    <div>
      <h2>Nested Layout</h2>
      <div className="nested-children">{children}</div>
    </div>
  )
}
