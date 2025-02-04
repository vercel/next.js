export default function Layout({ children }) {
  return (
    <div>
      <h1>@bar Layout</h1>
      <div id="bar-children">{children}</div>
    </div>
  )
}
