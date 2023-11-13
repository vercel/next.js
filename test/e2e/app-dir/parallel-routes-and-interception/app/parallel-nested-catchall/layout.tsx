import Link from 'next/link'

export default function Layout({ children, slot }) {
  return (
    <div>
      <div>Main content</div>
      <div id="main">{children}</div>
      <div>
        Slot content:
        <div id="slot-content">{slot}</div>
      </div>

      <div>
        <Link href="/parallel-nested-catchall/foo">foo</Link>
      </div>
      <div>
        <Link href="/parallel-nested-catchall/bar">catchall bar</Link>
      </div>
      <div>
        <Link href="/parallel-nested-catchall/foo/123">catchall foo id</Link>
      </div>
      <div>
        <Link href="/parallel-nested-catchall/baz">optional catchall baz</Link>
      </div>
      <div>
        <Link href="/parallel-nested-catchall/baz/123">
          optional catchall baz id
        </Link>
      </div>
    </div>
  )
}
