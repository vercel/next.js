export default function Template({ children }) {
  return (
    <div>
      <h3>Template</h3>
      <div id="nested-children">{children}</div>
    </div>
  )
}
