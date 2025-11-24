export default function Layout({ children, bar, foo }) {
  return (
    <main
      style={{
        backgroundColor: '#fff',
        zIndex: 300,
      }}
    >
      <h1>Parallel Routes Layout</h1>
      <div id="nested-children">{children}</div>
      <div id="foo-slot">{foo}</div>
      <div id="bar-slot">{bar}</div>
    </main>
  )
}
