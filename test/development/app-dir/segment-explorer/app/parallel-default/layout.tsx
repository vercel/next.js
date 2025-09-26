import Link from 'next/link'

export default function Layout({ children, bar, foo }) {
  return (
    <div>
      <h1>Nested Layout</h1>
      <div>
        <div>
          <Link href="/parallel-default/subroute">
            <div id="subroute-link">Go to /parallel-default/subroute</div>
          </Link>
        </div>
        <div>
          <Link href="/parallel-default">
            <div id="grid-link">Go to /parallel-default</div>
          </Link>
        </div>
      </div>
      <div id="nested-children">{children}</div>
      <div id="foo-slot">{foo}</div>
      <div id="bar-slot">{bar}</div>
    </div>
  )
}
