export default function Layout({ children }) {
  return (
    <div>
      <h2>@bar Layout</h2>
      <div id="bar-children">{children}</div>
    </div>
  )
}
