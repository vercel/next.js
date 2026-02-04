export default function Layout({ children, bar, foo }) {
  return (
    <div>
      <h1>Nested Layout</h1>
      <div id="nested-children">{children}</div>
      <div id="foo-slot">{foo}</div>
      <div id="bar-slot">{bar}</div>
    </div>
  )
}
