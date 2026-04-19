export default function Layout({ children, bar, foo }) {
  return (
    <div>
      <h1>Layout</h1>
      <div id="foo-slot">{foo}</div>
      <div id="bar-slot">{bar}</div>
    </div>
  )
}
