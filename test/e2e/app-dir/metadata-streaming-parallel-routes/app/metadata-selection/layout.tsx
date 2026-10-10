export default function Layout({ bar, foo }) {
  return (
    <main>
      <div id="bar-slot">{bar}</div>
      <div id="foo-slot">{foo}</div>
    </main>
  )
}
