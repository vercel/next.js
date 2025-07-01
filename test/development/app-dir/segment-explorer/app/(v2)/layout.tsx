export default function Layout({ children }) {
  return (
    <div>
      <h1>Nested Layout</h1>
      <div className="nested-children">{children}</div>
    </div>
  )
}
