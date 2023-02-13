export default function Layout({ baz }) {
  return (
    <div>
      parallel/(new)/layout:
      <div className="parallel" title="@baz">
        {baz}
      </div>
    </div>
  )
}
