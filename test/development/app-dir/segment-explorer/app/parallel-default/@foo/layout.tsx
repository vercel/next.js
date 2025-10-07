export default function Layout({ children }) {
  return (
    <div>
      <h1>@foo Layout</h1>
      <div id="foo-children">{children}</div>
    </div>
  )
}
