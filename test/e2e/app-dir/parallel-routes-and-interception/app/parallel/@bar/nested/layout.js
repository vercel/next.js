export default function Parallel({ a, b, children }) {
  return (
    <div>
      parallel/@bar/nested/layout
      <div className="parallel" title="@a">
        {a}
      </div>
      <div className="parallel" title="@b">
        {b}
      </div>
      <div className="parallel" title="children">
        {children}
      </div>
    </div>
  )
}
