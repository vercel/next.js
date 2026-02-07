export default function Layout({ children }) {
  return (
    <div>
      <h2>@foo Layout</h2>
      <div id="foo-children">{children}</div>
    </div>
  )
}
